/* @internal */
namespace ts {
    export interface EmitHelperFactory {
        getUnscopedHelperName(name: string): Identifier;
        // TypeScript Helpers
        createDecorateHelper(decoratorExpressions: readonly Expression[], target: Expression, memberName?: Expression, descriptor?: Expression): Expression;
        createMetadataHelper(metadataKey: string, metadataValue: Expression): Expression;
        createParamHelper(expression: Expression, parameterOffset: number): Expression;
        // ES2018 Helpers
        createAssignHelper(attributesSegments: readonly Expression[]): Expression;
        createAwaitHelper(expression: Expression): Expression;
        createAsyncGeneratorHelper(generatorFunc: FunctionExpression, hasLexicalThis: boolean): Expression;
        createAsyncDelegatorHelper(expression: Expression): Expression;
        createAsyncValuesHelper(expression: Expression): Expression;
        // ES2018 Destructuring Helpers
        createRestHelper(value: Expression, elements: readonly BindingOrAssignmentElement[], computedTempVariables: readonly Expression[]): Expression;
        // ES2017 Helpers
        createAwaiterHelper(hasLexicalThis: boolean, hasLexicalArguments: boolean, promiseConstructor: EntityName | Expression | undefined, body: Block): Expression;
        // ES2015 Helpers
        createExtendsHelper(name: Identifier): Expression;
        createTemplateObjectHelper(cooked: ArrayLiteralExpression, raw: ArrayLiteralExpression): Expression;
        createSpreadHelper(argumentList: readonly Expression[]): Expression;
        createSpreadArraysHelper(argumentList: readonly Expression[]): Expression;
        // ES2015 Destructuring Helpers
        createValuesHelper(expression: Expression): Expression;
        createReadHelper(iteratorRecord: Expression, count: number | undefined): Expression;
        // ES2015 Generator Helpers
        createGeneratorHelper(body: FunctionExpression): Expression;
        // ES Module Helpers
        createImportStarHelper(expression: Expression): Expression;
        createImportStarCallbackHelper(): Expression;
        createImportDefaultHelper(expression: Expression): Expression;
    }

    export function createEmitHelperFactory(context: TransformationContext): EmitHelperFactory {
        const factory = context.factory;
        return {
            getUnscopedHelperName,
            // TypeScript Helpers
            createDecorateHelper,
            createMetadataHelper,
            createParamHelper,
            // ES2018 Helpers
            createAssignHelper,
            createAwaitHelper,
            createAsyncGeneratorHelper,
            createAsyncDelegatorHelper,
            createAsyncValuesHelper,
            // ES2018 Destructuring Helpers
            createRestHelper,
            // ES2017 Helpers
            createAwaiterHelper,
            // ES2015 Helpers
            createExtendsHelper,
            createTemplateObjectHelper,
            createSpreadHelper,
            createSpreadArraysHelper,
            // ES2015 Destructuring Helpers
            createValuesHelper,
            createReadHelper,
            // ES2015 Generator Helpers
            createGeneratorHelper,
            // ES Module Helpers
            createImportStarHelper,
            createImportStarCallbackHelper,
            createImportDefaultHelper,
        };

        /**
         * Gets an identifier for the name of an *unscoped* emit helper.
         */
        function getUnscopedHelperName(name: string) {
            return setEmitFlags(factory.createIdentifier(name), EmitFlags.HelperName | EmitFlags.AdviseOnEmitNode);
        }

        // TypeScript Helpers

        function createDecorateHelper(decoratorExpressions: Expression[], target: Expression, memberName?: Expression, descriptor?: Expression) {
            context.requestEmitHelper(decorateHelper);

            const argumentsArray: Expression[] = [];
            argumentsArray.push(factory.createArrayLiteral(decoratorExpressions, /*multiLine*/ true));
            argumentsArray.push(target);
            if (memberName) {
                argumentsArray.push(memberName);
                if (descriptor) {
                    argumentsArray.push(descriptor);
                }
            }

            return factory.createCall(
                getUnscopedHelperName("__decorate"),
                /*typeArguments*/ undefined,
                argumentsArray
            );
        }

        function createMetadataHelper(metadataKey: string, metadataValue: Expression) {
            context.requestEmitHelper(metadataHelper);
            return factory.createCall(
                getUnscopedHelperName("__metadata"),
                /*typeArguments*/ undefined,
                [
                    factory.createStringLiteral(metadataKey),
                    metadataValue
                ]
            );
        }

        function createParamHelper(expression: Expression, parameterOffset: number, location?: TextRange) {
            context.requestEmitHelper(paramHelper);
            return setTextRange(
                factory.createCall(
                    getUnscopedHelperName("__param"),
                    /*typeArguments*/ undefined,
                    [
                        factory.createNumericLiteral(parameterOffset + ""),
                        expression
                    ]
                ),
                location
            );
        }

        // ES2018 Helpers

        function createAssignHelper(attributesSegments: Expression[]) {
            if (context.getCompilerOptions().target! >= ScriptTarget.ES2015) {
                return factory.createCall(factory.createPropertyAccess(factory.createIdentifier("Object"), "assign"),
                                  /*typeArguments*/ undefined,
                                  attributesSegments);
            }
            context.requestEmitHelper(assignHelper);
            return factory.createCall(
                getUnscopedHelperName("__assign"),
                /*typeArguments*/ undefined,
                attributesSegments
            );
        }

        function createAwaitHelper(expression: Expression) {
            context.requestEmitHelper(awaitHelper);
            return factory.createCall(getUnscopedHelperName("__await"), /*typeArguments*/ undefined, [expression]);
        }

        function createAsyncGeneratorHelper(generatorFunc: FunctionExpression, hasLexicalThis: boolean) {
            context.requestEmitHelper(awaitHelper);
            context.requestEmitHelper(asyncGeneratorHelper);

            // Mark this node as originally an async function
            (generatorFunc.emitNode || (generatorFunc.emitNode = {} as EmitNode)).flags |= EmitFlags.AsyncFunctionBody;

            return factory.createCall(
                getUnscopedHelperName("__asyncGenerator"),
                /*typeArguments*/ undefined,
                [
                    hasLexicalThis ? factory.createThis() : factory.createVoidZero(),
                    factory.createIdentifier("arguments"),
                    generatorFunc
                ]
            );
        }

        function createAsyncDelegatorHelper(expression: Expression) {
            context.requestEmitHelper(awaitHelper);
            context.requestEmitHelper(asyncDelegator);
            return factory.createCall(
                getUnscopedHelperName("__asyncDelegator"),
                /*typeArguments*/ undefined,
                [expression]
            );
        }

        function createAsyncValuesHelper(expression: Expression) {
            context.requestEmitHelper(asyncValues);
            return factory.createCall(
                getUnscopedHelperName("__asyncValues"),
                /*typeArguments*/ undefined,
                [expression]
            );
        }

        // ES2018 Destructuring Helpers

        /** Given value: o, propName: p, pattern: { a, b, ...p } from the original statement
         * `{ a, b, ...p } = o`, create `p = __rest(o, ["a", "b"]);`
         */
        function createRestHelper(value: Expression, elements: readonly BindingOrAssignmentElement[], computedTempVariables: readonly Expression[]): Expression {
            context.requestEmitHelper(restHelper);
            const propertyNames: Expression[] = [];
            let computedTempVariableOffset = 0;
            for (let i = 0; i < elements.length - 1; i++) {
                const propertyName = getPropertyNameOfBindingOrAssignmentElement(elements[i]);
                if (propertyName) {
                    if (isComputedPropertyName(propertyName)) {
                        const temp = computedTempVariables[computedTempVariableOffset];
                        computedTempVariableOffset++;
                        // typeof _tmp === "symbol" ? _tmp : _tmp + ""
                        propertyNames.push(
                            factory.createConditional(
                                factory.createTypeCheck(temp, "symbol"),
                                /*questionToken*/ undefined,
                                temp,
                                /*colonToken*/ undefined,
                                factory.createAdd(temp, factory.createStringLiteral(""))
                            )
                        );
                    }
                    else {
                        propertyNames.push(factory.createStringLiteralFromNode(propertyName));
                    }
                }
            }
            return factory.createCall(
                getUnscopedHelperName("__rest"),
                /*typeArguments*/ undefined,
                [value, factory.createArrayLiteral(propertyNames)]
            );
        }

        // ES2017 Helpers

        function createAwaiterHelper(hasLexicalThis: boolean, hasLexicalArguments: boolean, promiseConstructor: EntityName | Expression | undefined, body: Block) {
            context.requestEmitHelper(awaiterHelper);

            const generatorFunc = factory.createFunctionExpression(
                /*modifiers*/ undefined,
                factory.createToken(SyntaxKind.AsteriskToken),
                /*name*/ undefined,
                /*typeParameters*/ undefined,
                /*parameters*/ [],
                /*type*/ undefined,
                body
            );

            // Mark this node as originally an async function
            (generatorFunc.emitNode || (generatorFunc.emitNode = {} as EmitNode)).flags |= EmitFlags.AsyncFunctionBody | EmitFlags.ReuseTempVariableScope;

            return factory.createCall(
                getUnscopedHelperName("__awaiter"),
                /*typeArguments*/ undefined,
                [
                    hasLexicalThis ? factory.createThis() : factory.createVoidZero(),
                    hasLexicalArguments ? factory.createIdentifier("arguments") : factory.createVoidZero(),
                    promiseConstructor ? createExpressionFromEntityName(factory, promiseConstructor) : factory.createVoidZero(),
                    generatorFunc
                ]
            );
        }

        // ES2015 Helpers

        function createExtendsHelper(name: Identifier) {
            context.requestEmitHelper(extendsHelper);
            return factory.createCall(
                getUnscopedHelperName("__extends"),
                /*typeArguments*/ undefined,
                [name, factory.createFileLevelUniqueName("_super")]
            );
        }

        function createTemplateObjectHelper(cooked: ArrayLiteralExpression, raw: ArrayLiteralExpression) {
            context.requestEmitHelper(templateObjectHelper);
            return factory.createCall(
                getUnscopedHelperName("__makeTemplateObject"),
                /*typeArguments*/ undefined,
                [cooked, raw]
            );
        }

        function createSpreadHelper(argumentList: readonly Expression[]) {
            context.requestEmitHelper(readHelper);
            context.requestEmitHelper(spreadHelper);
            return factory.createCall(
                getUnscopedHelperName("__spread"),
                /*typeArguments*/ undefined,
                argumentList
            );
        }

        function createSpreadArraysHelper(argumentList: readonly Expression[]) {
            context.requestEmitHelper(spreadArraysHelper);
            return factory.createCall(
                getUnscopedHelperName("__spreadArrays"),
                /*typeArguments*/ undefined,
                argumentList
            );
        }

        // ES2015 Destructuring Helpers

        function createValuesHelper(expression: Expression) {
            context.requestEmitHelper(valuesHelper);
            return factory.createCall(
                getUnscopedHelperName("__values"),
                /*typeArguments*/ undefined,
                [expression]
            );
        }

        function createReadHelper(iteratorRecord: Expression, count: number | undefined) {
            context.requestEmitHelper(readHelper);
            return factory.createCall(
                getUnscopedHelperName("__read"),
                /*typeArguments*/ undefined,
                count !== undefined
                    ? [iteratorRecord, factory.createNumericLiteral(count + "")]
                    : [iteratorRecord]
            );
        }

        // ES2015 Generator Helpers

        function createGeneratorHelper(body: FunctionExpression) {
            context.requestEmitHelper(generatorHelper);
            return factory.createCall(
                getUnscopedHelperName("__generator"),
                /*typeArguments*/ undefined,
                [factory.createThis(), body]);
        }

        // ES Module Helpers

        function createImportStarHelper(expression: Expression) {
            context.requestEmitHelper(importStarHelper);
            return factory.createCall(
                getUnscopedHelperName("__importStar"),
                /*typeArguments*/ undefined,
                [expression]
            );
        }

        function createImportStarCallbackHelper() {
            context.requestEmitHelper(importStarHelper);
            return getUnscopedHelperName("__importStar");
        }

        function createImportDefaultHelper(expression: Expression) {
            context.requestEmitHelper(importDefaultHelper);
            return factory.createCall(
                getUnscopedHelperName("__importDefault"),
                /*typeArguments*/ undefined,
                [expression]
            );
        }
    }

    /* @internal */
    export function compareEmitHelpers(x: EmitHelper, y: EmitHelper) {
        if (x === y) return Comparison.EqualTo;
        if (x.priority === y.priority) return Comparison.EqualTo;
        if (x.priority === undefined) return Comparison.GreaterThan;
        if (y.priority === undefined) return Comparison.LessThan;
        return compareValues(x.priority, y.priority);
    }

    /**
     * @param input Template string input strings
     * @param args Names which need to be made file-level unique
     */
    export function helperString(input: TemplateStringsArray, ...args: string[]) {
        return (uniqueName: EmitHelperUniqueNameCallback) => {
            let result = "";
            for (let i = 0; i < args.length; i++) {
                result += input[i];
                result += uniqueName(args[i]);
            }
            result += input[input.length - 1];
            return result;
        };
    }

    // TypeScript Helpers

    export const decorateHelper: UnscopedEmitHelper = {
        name: "typescript:decorate",
        importName: "__decorate",
        scoped: false,
        priority: 2,
        text: `
            var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
                var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
                if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
                else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
                return c > 3 && r && Object.defineProperty(target, key, r), r;
            };`
    };

    export const metadataHelper: UnscopedEmitHelper = {
        name: "typescript:metadata",
        importName: "__metadata",
        scoped: false,
        priority: 3,
        text: `
            var __metadata = (this && this.__metadata) || function (k, v) {
                if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
            };`
    };

    export const paramHelper: UnscopedEmitHelper = {
        name: "typescript:param",
        importName: "__param",
        scoped: false,
        priority: 4,
        text: `
            var __param = (this && this.__param) || function (paramIndex, decorator) {
                return function (target, key) { decorator(target, key, paramIndex); }
            };`
    };

    // ES2018 Helpers

    export const assignHelper: UnscopedEmitHelper = {
        name: "typescript:assign",
        importName: "__assign",
        scoped: false,
        priority: 1,
        text: `
            var __assign = (this && this.__assign) || function () {
                __assign = Object.assign || function(t) {
                    for (var s, i = 1, n = arguments.length; i < n; i++) {
                        s = arguments[i];
                        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                            t[p] = s[p];
                    }
                    return t;
                };
                return __assign.apply(this, arguments);
            };`
    };

    export const awaitHelper: UnscopedEmitHelper = {
        name: "typescript:await",
        importName: "__await",
        scoped: false,
        text: `
            var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }`
    };

    export const asyncGeneratorHelper: UnscopedEmitHelper = {
        name: "typescript:asyncGenerator",
        importName: "__asyncGenerator",
        scoped: false,
        text: `
            var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
                if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
                var g = generator.apply(thisArg, _arguments || []), i, q = [];
                return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
                function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
                function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
                function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
                function fulfill(value) { resume("next", value); }
                function reject(value) { resume("throw", value); }
                function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
            };`
    };

    export const asyncDelegator: UnscopedEmitHelper = {
        name: "typescript:asyncDelegator",
        importName: "__asyncDelegator",
        scoped: false,
        text: `
            var __asyncDelegator = (this && this.__asyncDelegator) || function (o) {
                var i, p;
                return i = {}, verb("next"), verb("throw", function (e) { throw e; }), verb("return"), i[Symbol.iterator] = function () { return this; }, i;
                function verb(n, f) { i[n] = o[n] ? function (v) { return (p = !p) ? { value: __await(o[n](v)), done: n === "return" } : f ? f(v) : v; } : f; }
            };`
    };

    export const asyncValues: UnscopedEmitHelper = {
        name: "typescript:asyncValues",
        importName: "__asyncValues",
        scoped: false,
        text: `
            var __asyncValues = (this && this.__asyncValues) || function (o) {
                if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
                var m = o[Symbol.asyncIterator], i;
                return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
                function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
                function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
            };`
    };

    // ES2018 Destructuring Helpers

    export const restHelper: UnscopedEmitHelper = {
        name: "typescript:rest",
        importName: "__rest",
        scoped: false,
        text: `
            var __rest = (this && this.__rest) || function (s, e) {
                var t = {};
                for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
                    t[p] = s[p];
                if (s != null && typeof Object.getOwnPropertySymbols === "function")
                    for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
                        if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                            t[p[i]] = s[p[i]];
                    }
                return t;
            };`
    };

    // ES2017 Helpers

    export const awaiterHelper: UnscopedEmitHelper = {
        name: "typescript:awaiter",
        importName: "__awaiter",
        scoped: false,
        priority: 5,
        text: `
            var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
                function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
                return new (P || (P = Promise))(function (resolve, reject) {
                    function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
                    function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
                    function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
                    step((generator = generator.apply(thisArg, _arguments || [])).next());
                });
            };`
    };

    // ES2015 Helpers

    export const extendsHelper: UnscopedEmitHelper = {
        name: "typescript:extends",
        importName: "__extends",
        scoped: false,
        priority: 0,
        text: `
            var __extends = (this && this.__extends) || (function () {
                var extendStatics = function (d, b) {
                    extendStatics = Object.setPrototypeOf ||
                        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
                        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
                    return extendStatics(d, b);
                };

                return function (d, b) {
                    extendStatics(d, b);
                    function __() { this.constructor = d; }
                    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
                };
            })();`
    };

    export const templateObjectHelper: UnscopedEmitHelper = {
        name: "typescript:makeTemplateObject",
        importName: "__makeTemplateObject",
        scoped: false,
        priority: 0,
        text: `
            var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
                if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
                return cooked;
            };`
    };

    export const spreadHelper: UnscopedEmitHelper = {
        name: "typescript:spread",
        importName: "__spread",
        scoped: false,
        text: `
            var __spread = (this && this.__spread) || function () {
                for (var ar = [], i = 0; i < arguments.length; i++) ar = ar.concat(__read(arguments[i]));
                return ar;
            };`
    };

    export const spreadArraysHelper: UnscopedEmitHelper = {
        name: "typescript:spreadArrays",
        importName: "__spreadArrays",
        scoped: false,
        text: `
            var __spreadArrays = (this && this.__spreadArrays) || function () {
                for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
                for (var r = Array(s), k = 0, i = 0; i < il; i++)
                    for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
                        r[k] = a[j];
                return r;
            };`
    };

    // ES2015 Destructuring Helpers

    export const valuesHelper: UnscopedEmitHelper = {
        name: "typescript:values",
        importName: "__values",
        scoped: false,
        text: `
            var __values = (this && this.__values) || function(o) {
                var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
                if (m) return m.call(o);
                if (o && typeof o.length === "number") return {
                    next: function () {
                        if (o && i >= o.length) o = void 0;
                        return { value: o && o[i++], done: !o };
                    }
                };
                throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
            };`
    };

    export const readHelper: UnscopedEmitHelper = {
        name: "typescript:read",
        importName: "__read",
        scoped: false,
        text: `
            var __read = (this && this.__read) || function (o, n) {
                var m = typeof Symbol === "function" && o[Symbol.iterator];
                if (!m) return o;
                var i = m.call(o), r, ar = [], e;
                try {
                    while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
                }
                catch (error) { e = { error: error }; }
                finally {
                    try {
                        if (r && !r.done && (m = i["return"])) m.call(i);
                    }
                    finally { if (e) throw e.error; }
                }
                return ar;
            };`
    };

    // ES2015 Generator Helpers

    // The __generator helper is used by down-level transformations to emulate the runtime
    // semantics of an ES2015 generator function. When called, this helper returns an
    // object that implements the Iterator protocol, in that it has `next`, `return`, and
    // `throw` methods that step through the generator when invoked.
    //
    // parameters:
    //  @param thisArg  The value to use as the `this` binding for the transformed generator body.
    //  @param body     A function that acts as the transformed generator body.
    //
    // variables:
    //  _       Persistent state for the generator that is shared between the helper and the
    //          generator body. The state object has the following members:
    //            sent() - A method that returns or throws the current completion value.
    //            label  - The next point at which to resume evaluation of the generator body.
    //            trys   - A stack of protected regions (try/catch/finally blocks).
    //            ops    - A stack of pending instructions when inside of a finally block.
    //  f       A value indicating whether the generator is executing.
    //  y       An iterator to delegate for a yield*.
    //  t       A temporary variable that holds one of the following values (note that these
    //          cases do not overlap):
    //          - The completion value when resuming from a `yield` or `yield*`.
    //          - The error value for a catch block.
    //          - The current protected region (array of try/catch/finally/end labels).
    //          - The verb (`next`, `throw`, or `return` method) to delegate to the expression
    //            of a `yield*`.
    //          - The result of evaluating the verb delegated to the expression of a `yield*`.
    //
    // functions:
    //  verb(n)     Creates a bound callback to the `step` function for opcode `n`.
    //  step(op)    Evaluates opcodes in a generator body until execution is suspended or
    //              completed.
    //
    // The __generator helper understands a limited set of instructions:
    //  0: next(value?)     - Start or resume the generator with the specified value.
    //  1: throw(error)     - Resume the generator with an exception. If the generator is
    //                        suspended inside of one or more protected regions, evaluates
    //                        any intervening finally blocks between the current label and
    //                        the nearest catch block or function boundary. If uncaught, the
    //                        exception is thrown to the caller.
    //  2: return(value?)   - Resume the generator as if with a return. If the generator is
    //                        suspended inside of one or more protected regions, evaluates any
    //                        intervening finally blocks.
    //  3: break(label)     - Jump to the specified label. If the label is outside of the
    //                        current protected region, evaluates any intervening finally
    //                        blocks.
    //  4: yield(value?)    - Yield execution to the caller with an optional value. When
    //                        resumed, the generator will continue at the next label.
    //  5: yield*(value)    - Delegates evaluation to the supplied iterator. When
    //                        delegation completes, the generator will continue at the next
    //                        label.
    //  6: catch(error)     - Handles an exception thrown from within the generator body. If
    //                        the current label is inside of one or more protected regions,
    //                        evaluates any intervening finally blocks between the current
    //                        label and the nearest catch block or function boundary. If
    //                        uncaught, the exception is thrown to the caller.
    //  7: endfinally       - Ends a finally block, resuming the last instruction prior to
    //                        entering a finally block.
    //
    // For examples of how these are used, see the comments in ./transformers/generators.ts
    export const generatorHelper: UnscopedEmitHelper = {
        name: "typescript:generator",
        importName: "__generator",
        scoped: false,
        priority: 6,
        text: `
            var __generator = (this && this.__generator) || function (thisArg, body) {
                var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
                return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
                function verb(n) { return function (v) { return step([n, v]); }; }
                function step(op) {
                    if (f) throw new TypeError("Generator is already executing.");
                    while (_) try {
                        if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
                        if (y = 0, t) op = [op[0] & 2, t.value];
                        switch (op[0]) {
                            case 0: case 1: t = op; break;
                            case 4: _.label++; return { value: op[1], done: false };
                            case 5: _.label++; y = op[1]; op = [0]; continue;
                            case 7: op = _.ops.pop(); _.trys.pop(); continue;
                            default:
                                if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                                if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                                if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                                if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                                if (t[2]) _.ops.pop();
                                _.trys.pop(); continue;
                        }
                        op = body.call(thisArg, _);
                    } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
                    if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
                }
            };`
    };

    // ES Module Helpers

    // emit helper for `import * as Name from "foo"`
    export const importStarHelper: UnscopedEmitHelper = {
        name: "typescript:commonjsimportstar",
        importName: "__importStar",
        scoped: false,
        text: `
            var __importStar = (this && this.__importStar) || function (mod) {
                if (mod && mod.__esModule) return mod;
                var result = {};
                if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
                result["default"] = mod;
                return result;
            };`
    };

    // emit helper for `import Name from "foo"`
    export const importDefaultHelper: UnscopedEmitHelper = {
        name: "typescript:commonjsimportdefault",
        importName: "__importDefault",
        scoped: false,
        text: `
            var __importDefault = (this && this.__importDefault) || function (mod) {
                return (mod && mod.__esModule) ? mod : { "default": mod };
            };`
    };

    let allUnscopedEmitHelpers: ReadonlyMap<UnscopedEmitHelper> | undefined;

    export function getAllUnscopedEmitHelpers() {
        return allUnscopedEmitHelpers || (allUnscopedEmitHelpers = arrayToMap([
            decorateHelper,
            metadataHelper,
            paramHelper,
            assignHelper,
            awaitHelper,
            asyncGeneratorHelper,
            asyncDelegator,
            asyncValues,
            restHelper,
            awaiterHelper,
            extendsHelper,
            templateObjectHelper,
            spreadHelper,
            spreadArraysHelper,
            valuesHelper,
            readHelper,
            generatorHelper,
            importStarHelper,
            importDefaultHelper
        ], helper => helper.name));
    }

    export const asyncSuperHelper: EmitHelper = {
        name: "typescript:async-super",
        scoped: true,
        text: helperString`
            const ${"_superIndex"} = name => super[name];`
    };

    export const advancedAsyncSuperHelper: EmitHelper = {
        name: "typescript:advanced-async-super",
        scoped: true,
        text: helperString`
            const ${"_superIndex"} = (function (geti, seti) {
                const cache = Object.create(null);
                return name => cache[name] || (cache[name] = { get value() { return geti(name); }, set value(v) { seti(name, v); } });
            })(name => super[name], (name, value) => super[name] = value);`
    };
}