import {
  XmlError,
  xmlFreeNode,
  xmlHasNsProp,
  XmlNamedNodeStruct,
  xmlNodeGetContent,
  XmlNodeSetStruct,
  XmlNodeStruct,
  XmlNsStruct,
  xmlRemoveProp,
  xmlSearchNs,
  xmlUnlinkNode,
  xmlXPathCompiledEval,
  xmlXPathFreeContext,
  xmlXPathFreeObject,
  xmlXPathNewContext,
  XmlXPathObjectStruct,
  xmlXPathRegisterNs,
  xmlXPathSetContextNode
} from './wasm.mjs';
import { NamespaceMap, XmlXPath } from './xpath.mjs';

function compiledXPathEval(nodePtr: number, xpath: XmlXPath) {
  const context = xmlXPathNewContext(XmlNodeStruct.doc(nodePtr));

  if (xpath.namespaces) {
    for (const [prefix, uri] of Object.entries(xpath.namespaces)) {
      xmlXPathRegisterNs(context, prefix, uri);
    }
  }
  xmlXPathSetContextNode(nodePtr, context);

  const xpathCompiledEvalPtr = xmlXPathCompiledEval(xpath.ptr, context);

  xmlXPathFreeContext(context);

  return xpathCompiledEvalPtr;
}

function xpathEval(nodePtr: number, xpath: string | XmlXPath, namespaces?: NamespaceMap) {
  const xpathCompiled = xpath instanceof XmlXPath ? xpath : XmlXPath.compile(xpath, namespaces);

  const prt = compiledXPathEval(nodePtr, xpathCompiled);

  if (!(xpath instanceof XmlXPath)) {
    xpathCompiled[Symbol.dispose]();
  }

  return prt;
}

function namespaceForPrefix(nsPtr: number, prefix: string) {
  const xmlSearchNsPtr = xmlSearchNs(XmlNodeStruct.doc(nsPtr), nsPtr, prefix);

  return xmlSearchNsPtr ? XmlNsStruct.href(xmlSearchNsPtr) : null;
}

function createNode(nodePtr: number, namespaces?: NamespaceMap): XmlNode {
  const nodeType = XmlNodeStruct.type(nodePtr);
  switch (nodeType) {
    case XmlNodeStruct.Type.XML_ELEMENT_NODE:
      return new XmlElement(nodePtr, namespaces);
    case XmlNodeStruct.Type.XML_ATTRIBUTE_NODE:
      return new XmlAttribute(nodePtr);
    case XmlNodeStruct.Type.XML_TEXT_NODE:
      return new XmlText(nodePtr);
    case XmlNodeStruct.Type.XML_COMMENT_NODE:
      return new XmlComment(nodePtr);
    case XmlNodeStruct.Type.XML_CDATA_SECTION_NODE:
      return new XmlCData(nodePtr);
    default:
      throw new XmlError(`Unsupported node type ${nodeType}`);
  }
}

export class XmlNode {
  #ptr;
  #namespaces;

  constructor(nodePtr: number, namespaces?: NamespaceMap) {
    this.#ptr = nodePtr;
    this.#namespaces = namespaces;
  }

  get parent(): XmlElement | null {
    const parent = XmlNodeStruct.parent(this.#ptr);

    if (!parent || parent === XmlNodeStruct.doc(this.#ptr)) {
      return null;
    }

    return new XmlElement(parent, this.#namespaces);
  }

  get next(): XmlNode | null {
    return this.createNode(XmlNodeStruct.next(this.#ptr));
  }

  get content() {
    return xmlNodeGetContent(this.#ptr);
  }

  get line() {
    return XmlNodeStruct.line(this.#ptr);
  }

  get prev(): XmlNode | null {
    return this.createNode(XmlNodeStruct.prev(this.#ptr));
  }

  setNamespaces(namespaces: NamespaceMap) {
    this.#namespaces = namespaces;
  }
  protected get ptr() {
    return this.#ptr;
  }

  xpathGet(xpath: XmlXPath): XmlNode | null;
  xpathGet(xpath: string, namespaces?: NamespaceMap): XmlNode | null;
  xpathGet(xpath: string | XmlXPath, namespaces?: NamespaceMap): XmlNode | null;

  xpathGet(xpath: string | XmlXPath, namespaces?: NamespaceMap): XmlNode | null {
    const xpathPtr = xpathEval(this.#ptr, xpath, namespaces ?? this.#namespaces);

    if (!xpathPtr) {
      return null;
    }

    if (XmlXPathObjectStruct.type(xpathPtr) !== XmlXPathObjectStruct.Type.XPATH_NODESET) {
      xmlXPathFreeObject(xpathPtr);

      return null;
    }

    const nodeSetPtr = XmlXPathObjectStruct.nodesetval(xpathPtr);

    if (nodeSetPtr === 0 || XmlNodeSetStruct.nodeCount(nodeSetPtr) === 0) {
      xmlXPathFreeObject(xpathPtr);
      return null;
    }

    const node = this.createNode(XmlNodeSetStruct.nodeTable(nodeSetPtr, 1)[0]);

    xmlXPathFreeObject(xpathPtr);

    return node;
  }

  remove() {
    if (!this.#ptr) {
      return;
    }

    xmlUnlinkNode(this.#ptr);
    xmlFreeNode(this.#ptr);

    this.free();
  }


  xpathFind(xpath: XmlXPath): XmlNode[];
  xpathFind(xpath: string, namespaces?: NamespaceMap): XmlNode[];
  xpathFind(xpath: string | XmlXPath, namespaces?: NamespaceMap): XmlNode[] ;
  xpathFind(xpath: string | XmlXPath, namespaces?: NamespaceMap): XmlNode[] {
    const xpathPtr = xpathEval(this.#ptr, xpath, namespaces ?? this.#namespaces);

    if (!xpathPtr) {
      return [];
    }

    const nodes: XmlNode[] = [];

    if (XmlXPathObjectStruct.type(xpathPtr) === XmlXPathObjectStruct.Type.XPATH_NODESET) {
      const nodeSetPtr = XmlXPathObjectStruct.nodesetval(xpathPtr);
      const nodeCount = XmlNodeSetStruct.nodeCount(nodeSetPtr);
      const nodeTable = XmlNodeSetStruct.nodeTable(nodeSetPtr, nodeCount);

      for (let i = 0; i < nodeCount; i += 1) {
        nodes.push(createNode(nodeTable[i], this.#namespaces));
      }
    }

    xmlXPathFreeObject(xpathPtr);

    return nodes;
  }

  protected createNode(nodePtr: number | null) {
    return nodePtr ? createNode(nodePtr, this.#namespaces) : null;
  }

  protected free() {
    this.#ptr = 0;
  }
}

export class XmlNodeNamed extends XmlNode {
  get name(): string {
    return XmlNodeStruct.nameValue(this.ptr);
  }

  get prefix() {
    const namespacePtr = XmlNamedNodeStruct.namespace(this.ptr);

    return namespacePtr ? XmlNsStruct.prefix(namespacePtr) : null;
  }
}

export class XmlElement extends XmlNodeNamed {
  #elementChildren?: Map<string, XmlElement[]>;

  get firstChild(): XmlNode | null {
    return this.createNode(XmlNodeStruct.children(this.ptr));
  }

  get lastChild(): XmlNode | null {
    return this.createNode(XmlNodeStruct.last(this.ptr));
  }

  get attrs() {
    const attrs: XmlAttribute[] = [];

    for (let attrPtr = XmlNodeStruct.properties(this.ptr); attrPtr; attrPtr = XmlNodeStruct.next(attrPtr)) {
      attrs.push(new XmlAttribute(attrPtr));
    }

    return attrs;
  }

  get children() {
    const nodes: XmlNode[] = [];

    for (let childPtr = XmlNodeStruct.children(this.ptr); childPtr; childPtr = XmlNodeStruct.next(childPtr)) {
      const node = this.createNode(childPtr);
      if (node) {
        nodes.push(node);
      }
    }

    return nodes;
  }

  get elementChildren() {
    const elements: XmlElement[] = [];

    for (const child of this.children) {
      if (child instanceof XmlElement) {
        elements.push(child);
      }
    }

    return elements;
  }

  get namespaces() {
    const namespaces: NamespaceMap = {};

    for (let ns = XmlNodeStruct.nsDef(this.ptr); ns; ns = XmlNsStruct.next(ns)) {
      namespaces[XmlNsStruct.prefix(ns)] = XmlNsStruct.href(ns);
    }

    return namespaces;
  }

  find(name: string): XmlElement[] | null {
    if (!this.#elementChildren) {
      this.#elementChildren = new Map();
      for (const element of this.elementChildren) {
        const tag = element.name;

        const lit = this.#elementChildren.get(tag) ?? this.#elementChildren.set(tag, []).get(tag)!;
        lit.push(element);
      }
    }

    return this.#elementChildren.get(name) ?? null;
  }

  get(name: string): XmlElement | null {
    const list = this.find(name);

    return list?.[0] ?? null;
  }

  attr(name: string, prefix?: string) {
    const namespace = prefix ? namespaceForPrefix(this.ptr, prefix) : null;
    const attrPtr = xmlHasNsProp(this.ptr, name, namespace);

    if (!attrPtr) {
      return null;
    }

    return new XmlAttribute(attrPtr);
  }
}

export class XmlAttribute extends XmlNodeNamed {
  get value() {
    return super.content;
  }

  get next() {
    return null;
  }

  get prev() {
    return null;
  }

  remove() {
    if (!this.ptr) {
      return;
    }

    if (xmlRemoveProp(this.ptr)) {
      throw new XmlError('Failed to remove attribute');
    }

    this.free();
  }
}

export class XmlCData extends XmlNode {
}

export class XmlComment extends XmlNode {
}

export class XmlText extends XmlNode {
}
