namespace ts {
    describe("unittests:: FactoryAPI", () => {
        function assertSyntaxKind(node: Node, expected: SyntaxKind) {
            assert.strictEqual(node.kind, expected, `Actual: ${Debug.formatSyntaxKind(node.kind)} Expected: ${Debug.formatSyntaxKind(expected)}`);
        }
        describe("factory.createExportAssignment", () => {
            it("parenthesizes default export if necessary", () => {
                function checkExpression(expression: Expression) {
                    const node = factory.createExportAssignment(
                        /*decorators*/ undefined,
                        /*modifiers*/ undefined,
                        /*isExportEquals*/ false,
                        expression,
                    );
                    assertSyntaxKind(node.expression, SyntaxKind.ParenthesizedExpression);
                }

                const clazz = factory.createClassExpression(/*decorators*/ undefined, /*modifiers*/ undefined, "C", /*typeParameters*/ undefined, /*heritageClauses*/ undefined, [
                    factory.createPropertyDeclaration(/*decorators*/ undefined, [factory.createToken(SyntaxKind.StaticKeyword)], "prop", /*questionOrExclamationToken*/ undefined, /*type*/ undefined, factory.createStringLiteral("1")),
                ]);
                checkExpression(clazz);
                checkExpression(factory.createPropertyAccess(clazz, "prop"));

                const func = factory.createFunctionExpression(/*modifiers*/ undefined, /*asteriskToken*/ undefined, "fn", /*typeParameters*/ undefined, /*parameters*/ undefined, /*type*/ undefined, factory.createBlock([]));
                checkExpression(func);
                checkExpression(factory.createCall(func, /*typeArguments*/ undefined, /*argumentsArray*/ undefined));
                checkExpression(factory.createTaggedTemplate(func, /*typeArguments*/ undefined, factory.createNoSubstitutionTemplateLiteral("")));

                checkExpression(factory.createBinary(factory.createStringLiteral("a"), SyntaxKind.CommaToken, factory.createStringLiteral("b")));
                checkExpression(factory.createCommaList([factory.createStringLiteral("a"), factory.createStringLiteral("b")]));
            });
        });

        describe("factory.createArrowFunction", () => {
            it("parenthesizes concise body if necessary", () => {
                function checkBody(body: ConciseBody) {
                    const node = factory.createArrowFunction(
                        /*modifiers*/ undefined,
                        /*typeParameters*/ undefined,
                        [],
                        /*type*/ undefined,
                        /*equalsGreaterThanToken*/ undefined,
                        body,
                    );
                    assertSyntaxKind(node.body, SyntaxKind.ParenthesizedExpression);
                }

                checkBody(factory.createObjectLiteral());
                checkBody(factory.createPropertyAccess(factory.createObjectLiteral(), "prop"));
                checkBody(factory.createAsExpression(factory.createPropertyAccess(factory.createObjectLiteral(), "prop"), factory.createTypeReferenceNode("T", /*typeArguments*/ undefined)));
                checkBody(factory.createNonNullExpression(factory.createPropertyAccess(factory.createObjectLiteral(), "prop")));
                checkBody(factory.createCommaList([factory.createStringLiteral("a"), factory.createStringLiteral("b")]));
                checkBody(factory.createBinary(factory.createStringLiteral("a"), SyntaxKind.CommaToken, factory.createStringLiteral("b")));
            });
        });

        describe("createBinaryExpression", () => {
            it("parenthesizes arrow function in RHS if necessary", () => {
                const lhs = factory.createIdentifier("foo");
                const rhs = factory.createArrowFunction(
                    /*modifiers*/ undefined,
                    /*typeParameters*/ undefined,
                    [],
                    /*type*/ undefined,
                    /*equalsGreaterThanToken*/ undefined,
                    factory.createBlock([]),
                );
                function checkRhs(operator: BinaryOperator, expectParens: boolean) {
                    const node = factory.createBinary(lhs, operator, rhs);
                    assertSyntaxKind(node.right, expectParens ? SyntaxKind.ParenthesizedExpression : SyntaxKind.ArrowFunction);
                }

                checkRhs(SyntaxKind.CommaToken, /*expectParens*/ false);
                checkRhs(SyntaxKind.EqualsToken, /*expectParens*/ false);
                checkRhs(SyntaxKind.PlusEqualsToken, /*expectParens*/ false);
                checkRhs(SyntaxKind.BarBarToken, /*expectParens*/ true);
                checkRhs(SyntaxKind.AmpersandAmpersandToken, /*expectParens*/ true);
                checkRhs(SyntaxKind.QuestionQuestionToken, /*expectParens*/ true);
                checkRhs(SyntaxKind.EqualsEqualsToken, /*expectParens*/ true);
            });
        });
    });
}
