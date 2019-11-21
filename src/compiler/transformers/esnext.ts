/*@internal*/
namespace ts {
    export function transformESNext(context: TransformationContext) {
        const {
            factory,
            hoistVariableDeclaration,
        } = context;

        return chainBundle(context, transformSourceFile);

        function transformSourceFile(node: SourceFile) {
            if (node.isDeclarationFile) {
                return node;
            }

            return visitEachChild(node, visitor, context);
        }

        function visitor(node: Node): VisitResult<Node> {
            if ((node.transformFlags & TransformFlags.ContainsESNext) === 0) {
                return node;
            }
            switch (node.kind) {
                case SyntaxKind.PropertyAccessExpression:
                case SyntaxKind.ElementAccessExpression:
                case SyntaxKind.CallExpression:
                    if (node.flags & NodeFlags.OptionalChain) {
                        const updated = visitOptionalExpression(node as OptionalChain, /*captureThisArg*/ false, /*isDelete*/ false);
                        Debug.assertNotNode(updated, isSyntheticReference);
                        return updated;
                    }
                    return visitEachChild(node, visitor, context);
                case SyntaxKind.BinaryExpression:
                    if ((<BinaryExpression>node).operatorToken.kind === SyntaxKind.QuestionQuestionToken) {
                        return transformNullishCoalescingExpression(<BinaryExpression>node);
                    }
                    return visitEachChild(node, visitor, context);
                case SyntaxKind.DeleteExpression:
                    return visitDeleteExpression(node as DeleteExpression);
                default:
                    return visitEachChild(node, visitor, context);
            }
        }

        function flattenChain(chain: OptionalChain) {
            const links: OptionalChain[] = [chain];
            while (!chain.questionDotToken && !isTaggedTemplateExpression(chain)) {
                chain = cast(chain.expression, isOptionalChain);
                links.unshift(chain);
            }
            return { expression: chain.expression, chain: links };
        }

        function visitNonOptionalParenthesizedExpression(node: ParenthesizedExpression, captureThisArg: boolean, isDelete: boolean): Expression {
            const expression = visitNonOptionalExpression(node.expression, captureThisArg, isDelete);
            if (isSyntheticReference(expression)) {
                // `(a.b)` -> { expression `((_a = a).b)`, thisArg: `_a` }
                // `(a[b])` -> { expression `((_a = a)[b])`, thisArg: `_a` }
                return factory.createSyntheticReferenceExpression(factory.updateParen(node, expression.expression), expression.thisArg);
            }
            return factory.updateParen(node, expression);
        }

        function visitNonOptionalPropertyOrElementAccessExpression(node: AccessExpression, captureThisArg: boolean, isDelete: boolean): Expression {
            if (isOptionalChain(node)) {
                // If `node` is an optional chain, then it is the outermost chain of an optional expression.
                return visitOptionalExpression(node, captureThisArg, isDelete);
            }

            let expression: Expression = visitNode(node.expression, visitor, isExpression);
            Debug.assertNotNode(expression, isSyntheticReference);

            let thisArg: Expression | undefined;
            if (captureThisArg) {
                if (shouldCaptureInTempVariable(expression)) {
                    thisArg = factory.createTempVariable(hoistVariableDeclaration);
                    expression = factory.createAssignment(thisArg, expression);
                }
                else {
                    thisArg = expression;
                }
            }

            expression = node.kind === SyntaxKind.PropertyAccessExpression
                ? factory.updatePropertyAccess(node, expression, visitNode(node.name, visitor, isIdentifier))
                : factory.updateElementAccess(node, expression, visitNode(node.argumentExpression, visitor, isExpression));
            return thisArg ? factory.createSyntheticReferenceExpression(expression, thisArg) : expression;
        }

        function visitNonOptionalCallExpression(node: CallExpression, captureThisArg: boolean): Expression {
            if (isOptionalChain(node)) {
                // If `node` is an optional chain, then it is the outermost chain of an optional expression.
                return visitOptionalExpression(node, captureThisArg, /*isDelete*/ false);
            }
            return visitEachChild(node, visitor, context);
        }

        function visitNonOptionalExpression(node: Expression, captureThisArg: boolean, isDelete: boolean): Expression {
            switch (node.kind) {
                case SyntaxKind.ParenthesizedExpression: return visitNonOptionalParenthesizedExpression(node as ParenthesizedExpression, captureThisArg, isDelete);
                case SyntaxKind.PropertyAccessExpression:
                case SyntaxKind.ElementAccessExpression: return visitNonOptionalPropertyOrElementAccessExpression(node as AccessExpression, captureThisArg, isDelete);
                case SyntaxKind.CallExpression: return visitNonOptionalCallExpression(node as CallExpression, captureThisArg);
                default: return visitNode(node, visitor, isExpression);
            }
        }

        function visitOptionalExpression(node: OptionalChain, captureThisArg: boolean, isDelete: boolean): Expression {
            const { expression, chain } = flattenChain(node);
            const left = visitNonOptionalExpression(expression, isCallChain(chain[0]), /*isDelete*/ false);
            const leftThisArg = isSyntheticReference(left) ? left.thisArg : undefined;
            let leftExpression = isSyntheticReference(left) ? left.expression : left;
            let capturedLeft: Expression = leftExpression;
            if (shouldCaptureInTempVariable(leftExpression)) {
                capturedLeft = factory.createTempVariable(hoistVariableDeclaration);
                leftExpression = factory.createAssignment(capturedLeft, leftExpression);
            }
            let rightExpression = capturedLeft;
            let thisArg: Expression | undefined;
            for (let i = 0; i < chain.length; i++) {
                const segment = chain[i];
                switch (segment.kind) {
                    case SyntaxKind.PropertyAccessExpression:
                    case SyntaxKind.ElementAccessExpression:
                        if (i === chain.length - 1 && captureThisArg) {
                            if (shouldCaptureInTempVariable(rightExpression)) {
                                thisArg = factory.createTempVariable(hoistVariableDeclaration);
                                rightExpression = factory.createAssignment(thisArg, rightExpression);
                            }
                            else {
                                thisArg = rightExpression;
                            }
                        }
                        rightExpression = segment.kind === SyntaxKind.PropertyAccessExpression
                            ? factory.createPropertyAccess(rightExpression, visitNode(segment.name, visitor, isIdentifier))
                            : factory.createElementAccess(rightExpression, visitNode(segment.argumentExpression, visitor, isExpression));
                        break;
                    case SyntaxKind.CallExpression:
                        if (i === 0 && leftThisArg) {
                            rightExpression = factory.createFunctionCallCall(
                                rightExpression,
                                leftThisArg.kind === SyntaxKind.SuperKeyword ? factory.createThis() : leftThisArg,
                                visitNodes(segment.arguments, visitor, isExpression)
                            );
                        }
                        else {
                            rightExpression = factory.createCall(
                                rightExpression,
                                /*typeArguments*/ undefined,
                                visitNodes(segment.arguments, visitor, isExpression)
                            );
                        }
                        break;
                }
                setOriginalNode(rightExpression, segment);
            }

            const target = isDelete
                ? factory.createConditional(createNotNullCondition(leftExpression, capturedLeft, /*invert*/ true), /*questionToken*/ undefined, factory.createTrue(), /*colonToken*/ undefined, factory.createDelete(rightExpression))
                : factory.createConditional(createNotNullCondition(leftExpression, capturedLeft, /*invert*/ true), /*questionToken*/ undefined, factory.createVoidZero(), /*colonToken*/ undefined, rightExpression);
            return thisArg ? factory.createSyntheticReferenceExpression(target, thisArg) : target;
        }

        function createNotNullCondition(left: Expression, right: Expression, invert?: boolean) {
            return factory.createBinary(
                factory.createBinary(
                    left,
                    factory.createToken(invert ? SyntaxKind.EqualsEqualsEqualsToken : SyntaxKind.ExclamationEqualsEqualsToken),
                    factory.createNull()
                ),
                factory.createToken(invert ? SyntaxKind.BarBarToken : SyntaxKind.AmpersandAmpersandToken),
                factory.createBinary(
                    right,
                    factory.createToken(invert ? SyntaxKind.EqualsEqualsEqualsToken : SyntaxKind.ExclamationEqualsEqualsToken),
                    factory.createVoidZero()
                )
            );
        }

        function transformNullishCoalescingExpression(node: BinaryExpression) {
            let left = visitNode(node.left, visitor, isExpression);
            let right = left;
            if (shouldCaptureInTempVariable(left)) {
                right = factory.createTempVariable(hoistVariableDeclaration);
                left = factory.createAssignment(right, left);
            }
            return factory.createConditional(
                createNotNullCondition(left, right),
                /*questionToken*/ undefined,
                right,
                /*colonToken*/ undefined,
                visitNode(node.right, visitor, isExpression),
            );
        }

        function shouldCaptureInTempVariable(expression: Expression): boolean {
            // don't capture identifiers and `this` in a temporary variable
            // `super` cannot be captured as it's no real variable
            return !isIdentifier(expression) &&
                expression.kind !== SyntaxKind.ThisKeyword &&
                expression.kind !== SyntaxKind.SuperKeyword;
        }

        function visitDeleteExpression(node: DeleteExpression) {
            return isOptionalChain(skipParentheses(node.expression))
                ? setOriginalNode(visitNonOptionalExpression(node.expression, /*captureThisArg*/ false, /*isDelete*/ true), node)
                : factory.updateDelete(node, visitNode(node.expression, visitor, isExpression));
        }
    }
}
