namespace ts {
    describe("unittests:: debugDeprecation", () => {
        beforeEach(() => {
            const loggingHost = Debug.loggingHost;
            afterEach(() => {
                Debug.loggingHost = loggingHost;
            });
        });
        describe("deprecateFunction", () => {
            it("silent deprecation", () => {
                const deprecation = Debug.deprecateFunction(noop, {
                    warnAfter: "3.9",
                    typeScriptVersion: "3.8"
                });
                let logWritten = false;
                Debug.loggingHost = { log() { logWritten = true; } };
                deprecation();
                assert.isFalse(logWritten);
            });
            it("warning deprecation with warnAfter", () => {
                const deprecation = Debug.deprecateFunction(noop, {
                    warnAfter: "3.9",
                    typeScriptVersion: "3.9"
                });
                let logWritten = false;
                Debug.loggingHost = { log() { logWritten = true; } };
                deprecation();
                assert.isTrue(logWritten);
            });
            it("warning deprecation without warnAfter", () => {
                const deprecation = Debug.deprecateFunction(noop, {
                    typeScriptVersion: "3.9"
                });
                let logWritten = false;
                Debug.loggingHost = { log() { logWritten = true; } };
                deprecation();
                assert.isTrue(logWritten);
            });
            it("warning deprecation writes once", () => {
                const deprecation = Debug.deprecateFunction(noop, {
                    typeScriptVersion: "3.9"
                });
                let logWrites = 0;
                Debug.loggingHost = { log() { logWrites++; } };
                deprecation();
                deprecation();
                assert.equal(logWrites, 1);
            });
            it("error deprecation with errorAfter", () => {
                const deprecation = Debug.deprecateFunction(noop, {
                    warnAfter: "3.8",
                    errorAfter: "3.9",
                    typeScriptVersion: "3.9"
                });
                let logWritten = false;
                Debug.loggingHost = { log() { logWritten = true; } };
                expect(deprecation).throws();
                assert.isFalse(logWritten);
            });
            it("error deprecation with error", () => {
                const deprecation = Debug.deprecateFunction(noop, {
                    error: true,
                });
                let logWritten = false;
                Debug.loggingHost = { log() { logWritten = true; } };
                expect(deprecation).throws();
                assert.isFalse(logWritten);
            });
        });
        it("deprecateExport", () => {
            const obj = { foo: noop };
            Debug.deprecateExport(obj, "foo");
            let logWritten = false;
            Debug.loggingHost = { log() { logWritten = true; } };
            obj.foo();
            assert.isTrue(logWritten);
        });
        it("deprecateExports", () => {
            const obj = { foo: noop, bar: noop };
            Debug.deprecateExports(obj, ["foo", "bar"]);
            let logWrites = 0;
            Debug.loggingHost = { log() { logWrites++; } };
            obj.foo();
            obj.bar();
            assert.equal(logWrites, 2);
        });
    });
}