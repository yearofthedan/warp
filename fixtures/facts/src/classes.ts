class Base {
  protected items: string[] = [];
  protected log(message: string) {
    return message;
  }
}

export class Server extends Base {
  static #buffer: string[] = [];
  #handlers = new Map<string, string>();
  total = this.#handlers.size;

  constructor(private readonly port: number) {
    super();
  }

  static flush() {
    Server.#buffer = [];
  }

  get count() {
    return this.#handlers.size;
  }
  set count(n: number) {
    this.#handlers.clear();
  }

  add(pattern: string) {
    this.#handlers.set(pattern, pattern);
    this.log(pattern);
  }

  listen = () => this.port;

  push(item: string) {
    this.items.push(item);
    setTimeout(function (this: { stray: number }) {
      return this.stray;
    });
  }

  status(code: number) {
    return code;
  }
}

export const Anonymous = class {
  #n = 0;
  bump() {
    this.#n += 1;
  }
};

export class Counter2 {
  #count = 0;
  bump() {
    this.#count += 1;
    return this.#count;
  }
}
