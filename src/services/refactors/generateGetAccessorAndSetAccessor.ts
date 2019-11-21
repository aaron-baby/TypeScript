/* @internal */
namespace ts.refactor.generateGetAccessorAndSetAccessor {
    const actionName = "Generate 'get' and 'set' accessors";
    const actionDescription = Diagnostics.Generate_get_and_set_accessors.message;
    registerRefactor(actionName, { getEditsForAction, getAvailableActions });

    type AcceptedDeclaration = ParameterPropertyDeclaration | PropertyDeclaration | PropertyAssignment;
    type AcceptedNameType = Identifier | StringLiteral;
    type ContainerDeclaration = ClassLikeDeclaration | ObjectLiteralExpression;

    interface Info {
        readonly container: ContainerDeclaration;
        readonly isStatic: boolean;
        readonly isReadonly: boolean;
        readonly type: TypeNode | undefined;
        readonly declaration: AcceptedDeclaration;
        readonly fieldName: AcceptedNameType;
        readonly accessorName: AcceptedNameType;
        readonly originalName: string;
        readonly renameAccessor: boolean;
    }

    function getAvailableActions(context: RefactorContext): readonly ApplicableRefactorInfo[] {
        if (!getConvertibleFieldAtPosition(context)) return emptyArray;

        return [{
            name: actionName,
            description: actionDescription,
            actions: [
                {
                    name: actionName,
                    description: actionDescription
                }
            ]
        }];
    }

    function getEditsForAction(context: RefactorContext, _actionName: string): RefactorEditInfo | undefined {
        const { file } = context;

        const fieldInfo = getConvertibleFieldAtPosition(context);
        if (!fieldInfo) return undefined;

        const isJS = isSourceFileJS(file);
        const changeTracker = textChanges.ChangeTracker.fromContext(context);
        const { isStatic, isReadonly, fieldName, accessorName, originalName, type, container, declaration, renameAccessor } = fieldInfo;

        suppressLeadingAndTrailingTrivia(fieldName);
        suppressLeadingAndTrailingTrivia(declaration);
        suppressLeadingAndTrailingTrivia(container);

        const isInClassLike = isClassLike(container);
        // avoid Readonly modifier because it will convert to get accessor
        const modifierFlags = getModifierFlags(declaration) & ~ModifierFlags.Readonly;
        const accessorModifiers = isInClassLike
            ? !modifierFlags || modifierFlags & ModifierFlags.Private
                ? getModifiers(isJS, isStatic, SyntaxKind.PublicKeyword)
                : factory.createNodeArray(factory.createModifiersFromModifierFlags(modifierFlags))
            : undefined;
        const fieldModifiers = isInClassLike ? getModifiers(isJS, isStatic, SyntaxKind.PrivateKeyword) : undefined;

        updateFieldDeclaration(changeTracker, file, declaration, fieldName, fieldModifiers);

        const getAccessor = generateGetAccessor(fieldName, accessorName, type, accessorModifiers, isStatic, container);
        suppressLeadingAndTrailingTrivia(getAccessor);
        insertAccessor(changeTracker, file, getAccessor, declaration, container);

        if (isReadonly) {
            // readonly modifier only existed in classLikeDeclaration
            const constructor = getFirstConstructorWithBody(<ClassLikeDeclaration>container);
            if (constructor) {
                updateReadonlyPropertyInitializerStatementConstructor(changeTracker, file, constructor, fieldName.text, originalName);
            }
        }
        else {
            const setAccessor = generateSetAccessor(fieldName, accessorName, type, accessorModifiers, isStatic, container);
            suppressLeadingAndTrailingTrivia(setAccessor);
            insertAccessor(changeTracker, file, setAccessor, declaration, container);
        }

        const edits = changeTracker.getChanges();
        const renameFilename = file.fileName;

        const nameNeedRename = renameAccessor ? accessorName : fieldName;
        const renameLocationOffset = isIdentifier(nameNeedRename) ? 0 : -1;
        const renameLocation = renameLocationOffset + getRenameLocation(edits, renameFilename, nameNeedRename.text, /*preferLastLocation*/ isParameter(declaration));
        return { renameFilename, renameLocation, edits };
    }

    function isConvertibleName (name: DeclarationName): name is AcceptedNameType {
        return isIdentifier(name) || isStringLiteral(name);
    }

    function isAcceptedDeclaration(node: Node): node is AcceptedDeclaration {
        return isParameterPropertyDeclaration(node, node.parent) || isPropertyDeclaration(node) || isPropertyAssignment(node);
    }

    function createPropertyName(name: string, originalName: AcceptedNameType) {
        return isIdentifier(originalName) ? factory.createIdentifier(name) : factory.createStringLiteral(name);
    }

    function createAccessorAccessExpression (fieldName: AcceptedNameType, isStatic: boolean, container: ContainerDeclaration) {
        const leftHead = isStatic ? (<ClassLikeDeclaration>container).name! : factory.createThis(); // TODO: GH#18217
        return isIdentifier(fieldName) ? factory.createPropertyAccess(leftHead, fieldName) : factory.createElementAccess(leftHead, factory.createStringLiteralFromNode(fieldName));
    }

    function getModifiers(isJS: boolean, isStatic: boolean, accessModifier: SyntaxKind.PublicKeyword | SyntaxKind.PrivateKeyword): NodeArray<Modifier> | undefined {
        const modifiers = append<Modifier>(
            !isJS ? [factory.createModifier(accessModifier) as Token<SyntaxKind.PublicKeyword> | Token<SyntaxKind.PrivateKeyword>] : undefined,
            isStatic ? factory.createModifier(SyntaxKind.StaticKeyword) : undefined
        );
        return modifiers && factory.createNodeArray(modifiers);
    }

    function startsWithUnderscore(name: string): boolean {
        return name.charCodeAt(0) === CharacterCodes._;
    }

    function getConvertibleFieldAtPosition(context: RefactorContext): Info | undefined {
        const { file, startPosition, endPosition } = context;

        const node = getTokenAtPosition(file, startPosition);
        const declaration = findAncestor(node.parent, isAcceptedDeclaration);
        // make sure declaration have AccessibilityModifier or Static Modifier or Readonly Modifier
        const meaning = ModifierFlags.AccessibilityModifier | ModifierFlags.Static | ModifierFlags.Readonly;
        if (!declaration || !nodeOverlapsWithStartEnd(declaration.name, file, startPosition, endPosition!) // TODO: GH#18217
            || !isConvertibleName(declaration.name) || (getModifierFlags(declaration) | meaning) !== meaning) return undefined;

        const name = declaration.name.text;
        const startWithUnderscore = startsWithUnderscore(name);
        const fieldName = createPropertyName(startWithUnderscore ? name : getUniqueName(`_${name}`, file), declaration.name);
        const accessorName = createPropertyName(startWithUnderscore ? getUniqueName(name.substring(1), file) : name, declaration.name);
        return {
            isStatic: hasStaticModifier(declaration),
            isReadonly: hasReadonlyModifier(declaration),
            type: getTypeAnnotationNode(declaration),
            container: declaration.kind === SyntaxKind.Parameter ? declaration.parent.parent : declaration.parent,
            originalName: (<AcceptedNameType>declaration.name).text,
            declaration,
            fieldName,
            accessorName,
            renameAccessor: startWithUnderscore
        };
    }

    function generateGetAccessor(fieldName: AcceptedNameType, accessorName: AcceptedNameType, type: TypeNode | undefined, modifiers: ModifiersArray | undefined, isStatic: boolean, container: ContainerDeclaration) {
        return factory.createGetAccessorDeclaration(
            /*decorators*/ undefined,
            modifiers,
            accessorName,
            /*parameters*/ undefined!, // TODO: GH#18217
            type,
            factory.createBlock([
                factory.createReturn(
                    createAccessorAccessExpression(fieldName, isStatic, container)
                )
            ], /*multiLine*/ true)
        );
    }

    function generateSetAccessor(fieldName: AcceptedNameType, accessorName: AcceptedNameType, type: TypeNode | undefined, modifiers: ModifiersArray | undefined, isStatic: boolean, container: ContainerDeclaration) {
        return factory.createSetAccessorDeclaration(
            /*decorators*/ undefined,
            modifiers,
            accessorName,
            [factory.createParameterDeclaration(
                /*decorators*/ undefined,
                /*modifiers*/ undefined,
                /*dotDotDotToken*/ undefined,
                factory.createIdentifier("value"),
                /*questionToken*/ undefined,
                type
            )],
            factory.createBlock([
                factory.createExpressionStatement(
                    factory.createAssignment(
                        createAccessorAccessExpression(fieldName, isStatic, container),
                        factory.createIdentifier("value")
                    )
                )
            ], /*multiLine*/ true)
        );
    }

    function updatePropertyDeclaration(changeTracker: textChanges.ChangeTracker, file: SourceFile, declaration: PropertyDeclaration, fieldName: AcceptedNameType, modifiers: ModifiersArray | undefined) {
        const property = factory.updatePropertyDeclaration(
            declaration,
            declaration.decorators,
            modifiers,
            fieldName,
            declaration.questionToken || declaration.exclamationToken,
            declaration.type,
            declaration.initializer
        );
        changeTracker.replaceNode(file, declaration, property);
    }

    function updatePropertyAssignmentDeclaration(changeTracker: textChanges.ChangeTracker, file: SourceFile, declaration: PropertyAssignment, fieldName: AcceptedNameType) {
        const assignment = factory.updatePropertyAssignment(declaration, fieldName, declaration.initializer);
        changeTracker.replacePropertyAssignment(file, declaration, assignment);
    }

    function updateFieldDeclaration(changeTracker: textChanges.ChangeTracker, file: SourceFile, declaration: AcceptedDeclaration, fieldName: AcceptedNameType, modifiers: ModifiersArray | undefined) {
        if (isPropertyDeclaration(declaration)) {
            updatePropertyDeclaration(changeTracker, file, declaration, fieldName, modifiers);
        }
        else if (isPropertyAssignment(declaration)) {
            updatePropertyAssignmentDeclaration(changeTracker, file, declaration, fieldName);
        }
        else {
            changeTracker.replaceNode(file, declaration,
                factory.updateParameterDeclaration(declaration, declaration.decorators, modifiers, declaration.dotDotDotToken, cast(fieldName, isIdentifier), declaration.questionToken, declaration.type, declaration.initializer));
        }
    }

    function insertAccessor(changeTracker: textChanges.ChangeTracker, file: SourceFile, accessor: AccessorDeclaration, declaration: AcceptedDeclaration, container: ContainerDeclaration) {
        isParameterPropertyDeclaration(declaration, declaration.parent) ? changeTracker.insertNodeAtClassStart(file, <ClassLikeDeclaration>container, accessor) :
            isPropertyAssignment(declaration) ? changeTracker.insertNodeAfterComma(file, declaration, accessor) :
            changeTracker.insertNodeAfter(file, declaration, accessor);
    }

    function updateReadonlyPropertyInitializerStatementConstructor(changeTracker: textChanges.ChangeTracker, file: SourceFile, constructor: ConstructorDeclaration, fieldName: string, originalName: string) {
        if (!constructor.body) return;
        constructor.body.forEachChild(function recur(node) {
            if (isElementAccessExpression(node) &&
                node.expression.kind === SyntaxKind.ThisKeyword &&
                isStringLiteral(node.argumentExpression) &&
                node.argumentExpression.text === originalName &&
                isWriteAccess(node)) {
                changeTracker.replaceNode(file, node.argumentExpression, factory.createStringLiteral(fieldName));
            }
            if (isPropertyAccessExpression(node) && node.expression.kind === SyntaxKind.ThisKeyword && node.name.text === originalName && isWriteAccess(node)) {
                changeTracker.replaceNode(file, node.name, factory.createIdentifier(fieldName));
            }
            if (!isFunctionLike(node) && !isClassLike(node)) {
                node.forEachChild(recur);
            }
        });
    }
}
