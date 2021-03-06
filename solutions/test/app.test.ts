import * as App from "@app/App";
import * as E from "@app/Either";
import { pipe } from "@app/Function";
import { makeStateRef } from "@app/StateRef";

describe("App", () => {
  it("should use succeed", async () => {
    const program = App.succeed(0);

    const main = program({});

    const result = await main();

    expect(result).toEqual(E.right(0));
  });
  it("should use fail", async () => {
    const program = App.fail(0);

    const main = program({});

    const result = await main();

    expect(result).toEqual(E.left(0));
  });
  it("should use sync", async () => {
    const program = App.sync(() => {
      return 1 + 1;
    });

    const main = program({});

    const result = await main();

    expect(result).toEqual(E.right(2));
  });
  it("should use async", async () => {
    const program = App.async(
      () =>
        new Promise<number>((res) => {
          setTimeout(() => {
            res(1);
          }, 100);
        })
    );

    const main = program({});

    const result = await main();

    expect(result).toEqual(E.right(1));
  });
  it("should use trySync - succeed", async () => {
    class MyError {
      readonly _tag = "MyError";
      constructor(readonly error: unknown) {}
    }
    const program = App.trySync(
      () => {
        return 1 + 1;
      },
      (e) => new MyError(e)
    );

    const main = program({});

    const result = await main();

    expect(result).toEqual(E.right(2));
  });
  it("should use trySync - fail", async () => {
    class MyError {
      readonly _tag = "MyError";
      constructor(readonly error: unknown) {}
    }
    const program = App.trySync(
      (): number => {
        throw "error";
      },
      (e) => new MyError(e)
    );

    const main = program({});

    const result = await main();

    expect(result).toEqual(E.left(new MyError("error")));
  });
  it("should use tryAsync", async () => {
    class MyError {
      readonly _tag = "MyError";
      constructor(readonly error: unknown) {}
    }
    const programFail = App.tryAsync(
      () => Promise.reject("error"),
      (e) => new MyError(e)
    );
    const programSucceed = App.tryAsync(
      () => Promise.resolve("result"),
      (e) => new MyError(e)
    );

    const mainFail = programFail({});
    const mainSucceed = programSucceed({});

    const resultFail = await mainFail();
    const resultSucceed = await mainSucceed();

    expect(resultFail).toEqual(E.left(new MyError("error")));
    expect(resultSucceed).toEqual(E.right("result"));
  });
  it("should use access", async () => {
    interface Config {
      Config: {
        multiplier: number;
      };
    }

    const program = App.access(({ Config }: Config) => Config.multiplier * 3);

    const main = program({
      Config: {
        multiplier: 2,
      },
    });

    const result = await main();

    expect(result).toEqual(E.right(6));
  });
  it("should use map", async () => {
    interface Config {
      Config: {
        base: number;
      };
    }

    const program = pipe(
      App.access((_: Config) => _.Config.base),
      App.map((n) => n + 1),
      App.map((n) => n + 2),
      App.map((n) => n + 3)
    );

    const main = program({
      Config: {
        base: 1,
      },
    });

    const result = await main();

    expect(result).toEqual(E.right(7));
  });
  it("should use chain", async () => {
    interface Config {
      Config: {
        base: number;
      };
    }

    function addOneTimeout(n: number): App.App<unknown, never, number> {
      return App.async(
        () =>
          new Promise<number>((res) => {
            setTimeout(() => {
              res(n + 1);
            }, 100);
          })
      );
    }

    class DivideError {
      readonly _tag = "DivideError";
      constructor(readonly s: string) {}
    }

    function divideOrFail(n: number): App.App<unknown, DivideError, number> {
      return App.trySync(
        () => {
          if (n === 0) {
            throw "n is 0";
          }
          return 10 / n;
        },
        (s) => new DivideError(s as string)
      );
    }

    const initialValue = App.access((_: Config) => _.Config.base);

    const program = pipe(
      initialValue,
      App.chain(addOneTimeout),
      App.chain(divideOrFail),
      App.map((n) => n + 3)
    );

    const main = program({
      Config: {
        base: 1,
      },
    });

    const result = await main();

    expect(result).toEqual(E.right(8));
  });
  it("should use accessM", async () => {
    const lines: string[] = [];
    interface Printer {
      Printer: {
        printLn: (line: string) => App.UIO<void>;
      };
    }
    function printLn(line: string) {
      return App.accessM(({ Printer }: Printer) => Printer.printLn(line));
    }
    const program = pipe(
      printLn("hello"),
      App.chain(() => printLn("world"))
    );
    const testPrinter: Printer = {
      Printer: {
        printLn: (line) =>
          App.sync(() => {
            lines.push(line);
          }),
      },
    };
    const main = program(testPrinter);
    const result = await main();
    expect(result).toEqual(E.right(undefined));
    expect(lines).toEqual(["hello", "world"]);
  });
  it("should use zipWith", async () => {
    const program = pipe(
      App.sync(() => 10),
      App.zipWith(
        App.sync(() => 20),
        (a, b) => a + b
      )
    );
    const main = program({});
    const result = await main();
    expect(result).toEqual(E.right(30));
  });
  it("should use catchAll", async () => {
    interface Config {
      Config: {
        base: number;
      };
    }

    function addOneTimeout(n: number): App.App<unknown, never, number> {
      return App.async(
        () =>
          new Promise<number>((res) => {
            setTimeout(() => {
              res(n + 1);
            }, 100);
          })
      );
    }

    class DivideError {
      readonly _tag = "DivideError";
      constructor(readonly s: string) {}
    }

    function divideOrFail(n: number): App.App<unknown, DivideError, number> {
      return App.trySync(
        () => {
          if (n === 0) {
            throw "n is 0";
          }
          return 10 / n;
        },
        (s) => new DivideError(s as string)
      );
    }

    const initialValue = App.access((_: Config) => _.Config.base);

    const program = pipe(
      initialValue,
      App.chain(addOneTimeout),
      App.chain(divideOrFail),
      App.catchAll(() => App.succeed(1)),
      App.map((n) => n + 3)
    );

    const main = program({
      Config: {
        base: -1,
      },
    });

    const result = await main();

    expect(result).toEqual(E.right(4));
  });
  it("should use tuple", async () => {
    const program = App.tuple(
      App.succeed(0),
      App.succeed(1),
      App.succeed(2),
      App.succeed(3)
    );
    const main = program({});

    const result = await main();

    expect(result).toEqual(E.right([0, 1, 2, 3]));
  });
  it("should use tuple - fail", async () => {
    const program = App.tuplePar(
      App.succeed(0),
      App.succeed(1),
      App.fail("error"),
      App.succeed(2),
      App.succeed(3)
    );

    const main = program({});

    const result = await main();

    expect(result).toEqual(E.left("error"));
  });
  it("should use provide", async () => {
    interface Config {
      Config: {
        base: number;
      };
    }

    function addOneTimeout(n: number): App.App<unknown, never, number> {
      return App.async(
        () =>
          new Promise<number>((res) => {
            setTimeout(() => {
              res(n + 1);
            }, 100);
          })
      );
    }

    class DivideError {
      readonly _tag = "DivideError";
      constructor(readonly s: string) {}
    }

    function divideOrFail(n: number): App.App<unknown, DivideError, number> {
      return App.trySync(
        () => {
          if (n === 0) {
            throw "n is 0";
          }
          return 10 / n;
        },
        (s) => new DivideError(s as string)
      );
    }

    const initialValue = App.access((_: Config) => _.Config.base);

    const program = pipe(
      initialValue,
      App.chain(addOneTimeout),
      App.chain(divideOrFail),
      App.catchAll(() => App.succeed(1)),
      App.map((n) => n + 3),
      App.provide<Config>({
        Config: {
          base: -1,
        },
      })
    );

    const main = program({});

    const result = await main();

    expect(result).toEqual(E.right(4));
  });
  it("should use provideM", async () => {
    const lines: string[] = [];
    interface Printer {
      Printer: {
        printLn: (line: string) => App.UIO<void>;
      };
    }
    interface ConsoleService {
      Console: {
        log: (line: string) => void;
      };
    }
    function printLn(line: string) {
      return App.accessM(({ Printer }: Printer) => Printer.printLn(line));
    }
    const program = pipe(
      printLn("hello"),
      App.chain(() => printLn("world"))
    );

    const livePrinter = App.access(
      (_: ConsoleService): Printer => ({
        Printer: {
          printLn: (line) =>
            App.sync(() => {
              _.Console.log(line);
            }),
        },
      })
    );

    const testConsole: ConsoleService = {
      Console: {
        log: (line) => {
          lines.push(line);
        },
      },
    };

    const result = await pipe(
      program,
      App.provideM(livePrinter),
      App.provide(testConsole),
      App.unsafeRun
    );

    expect(result).toEqual(E.right(undefined));
    expect(lines).toEqual(["hello", "world"]);
  });
  it("should use Do - bind", async () => {
    const result = await pipe(
      App.Do,
      App.bind("x", () => App.succeed(1)),
      App.bind("y", () => App.succeed(2)),
      App.bind("z", ({ x, y }) => App.succeed(x + y)),
      App.map(({ z }) => z),
      App.unsafeRun
    );
    expect(result).toEqual(E.right(3));
  });
  it("should use stateRef", async () => {
    const result = await pipe(
      makeStateRef(0),
      App.tap((ref) => ref.update((n) => n + 1)),
      App.tap((ref) => ref.update((n) => n + 1)),
      App.chain((ref) => ref.get),
      App.unsafeRun
    );
    expect(result).toEqual(E.right(2));
  });
});
