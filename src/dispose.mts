export class Dispose implements Disposable {
  #ptr;
  readonly #free;

  constructor(ptr: number, free: (prt: number) => void) {
    this.#ptr = ptr;
    this.#free = free;
  }

  get ptr() {
    return this.#ptr;
  }

  [Symbol.dispose]() {
    if (!this.#ptr) {
      return;
    }

    this.#free(this.#ptr);

    this.#ptr = 0;
  }
}
