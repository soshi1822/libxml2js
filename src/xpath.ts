import { xmlXPathCtxtCompile, xmlXPathFreeCompExpr } from './libxml2';
import { Dispose } from './dispose';

export interface NamespaceMap {
  [prefix: string]: string;
}

export class XmlXPath extends Dispose {
  readonly #source;
  readonly #namespaces;

  constructor(ptr: number, value: string, namespaces?: NamespaceMap) {
    super(ptr, xmlXPathFreeCompExpr);

    this.#source = value;
    this.#namespaces = namespaces;
  }

  get namespaces() {
    return this.#namespaces;
  }

  static compile(value: string, namespaces?: NamespaceMap) {
    return new this(xmlXPathCtxtCompile(0, value), value, namespaces);
  }

  toString() {
    return this.#source;
  }
}
