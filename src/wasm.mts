import libxml2module from '../lib/libxml2-wasm.mjs';

export const libxml2 = await libxml2module();
libxml2._xmlInitParser();

export interface ErrorDetail {
  message: string;
  line: number;
  col: number;
}

export class XmlError extends Error {
  details: ErrorDetail[];

  constructor(message: string, details: ErrorDetail[] = []) {
    super(message);
    this.details = details;
  }
}

export class XmlErrorCollector {
  static #storageIndex = 0;
  static #storage = new Map<number, ErrorDetail[]>();

  static create() {
    const index = (this.#storageIndex += 1);

    this.#storage.set(index, []);

    return index;
  }

  static get(index: number) {
    return this.#storage.get(index) ?? [];
  }

  static delete(index: number) {
    this.#storage.delete(index);
  }

  static #errorCallback = () =>
    (index: number, err: number) => {
      this.#storage
        .get(index)
        ?.push({
          message: XmlErrorStruct.message(err),
          line: XmlErrorStruct.line(err),
          col: XmlErrorStruct.col(err)
        });
    };

  static errorEventCatchPtr: number = libxml2.addFunction(XmlErrorCollector.#errorCallback(), 'vii');
}

function string2pointer(value: string | null) {
  if (!value) {
    return { ptr: 0, length: 0 };
  }

  const length = libxml2.lengthBytesUTF8(value);
  const ptr = libxml2._malloc(length + 1);
  libxml2.stringToUTF8(value, ptr, length + 1);

  return { ptr, length };
}


function pointer2string(ptr: number): string {
  const value = libxml2.UTF8ToString(ptr);

  libxml2._free(ptr);

  return value;
}

function buffer2pointer(buffer: Uint8Array) {
  const ptr = libxml2._malloc(buffer.length + 1);

  libxml2.HEAPU8.set(buffer, ptr);
  libxml2.HEAPU8[ptr + buffer.length] = 0;

  return { ptr, length: buffer.length };
}

export function xmlReadMemory(ctxtPtr: number, xml: string | Uint8Array, url: string | null, encoding: null, options: number): number {
  const { ptr: xmlPtr, length: xmlLength } =
    typeof xml === 'string' ? string2pointer(xml) : buffer2pointer(xml);
  const urlPtr = string2pointer(url).ptr;

  const xmlCtxtPtr = libxml2._xmlCtxtReadMemory(ctxtPtr, xmlPtr, xmlLength, urlPtr, 0, options);

  libxml2._free(xmlPtr);
  libxml2._free(urlPtr);

  return xmlCtxtPtr;
}

export function xmlXPathRegisterNs(ctxPtr: number, prefix: string, uri: string): number {
  const prefixPtr = string2pointer(prefix).ptr;
  const uriPtr = string2pointer(uri).ptr;

  const xmlXPathRegisterNsPtr = libxml2._xmlXPathRegisterNs(ctxPtr, prefixPtr, uriPtr);

  libxml2._free(prefixPtr);
  libxml2._free(uriPtr);

  return xmlXPathRegisterNsPtr;
}

export function xmlHasNsProp(nodePtr: number, name: string, namespace: string | null): number {
  const namePtr = string2pointer(name).ptr;
  const namespacePtr = string2pointer(namespace).ptr;

  const xmlHasNsPropPtr = libxml2._xmlHasNsProp(nodePtr, namePtr, namespacePtr);

  libxml2._free(namePtr);
  libxml2._free(namespacePtr);

  return xmlHasNsPropPtr;
}

export function xmlSetNsProp(nodePtr: number, namespacePtr: number, name: string, value: string): number {
  const namePtr = string2pointer(name).ptr;
  const valuePtr = string2pointer(value).ptr;

  const xmlSetNsPropPtr = libxml2._xmlSetNsProp(nodePtr, namespacePtr, namePtr, valuePtr);

  libxml2._free(namePtr);
  libxml2._free(valuePtr);

  return xmlSetNsPropPtr;
}

export function xmlNodeGetContent(nodePtr: number): string {
  return pointer2string(libxml2._xmlNodeGetContent(nodePtr));
}

function getValueFunc(offset: number, type: string): (ptr: number) => number {
  return (ptr: number) => {
    if (ptr === 0) {
      throw new XmlError('Access with null number');
    }
    return libxml2.getValue(ptr + offset, type);
  };
}

function getNullableStringValueFunc(offset: number): (ptr: number) => string | null {
  return (ptr: number) => {
    if (ptr === 0) {
      return null;
    }

    return libxml2.getValue(ptr + offset, 'i8*');
  };
}

function getStringValueFunc(offset: number): (ptr: number) => string {
  return (ptr: number) => {
    if (ptr === 0) {
      throw new XmlError('Access with null number');
    }

    return libxml2.UTF8ToString(libxml2.getValue(ptr + offset, 'i8*'));
  };
}

export function xmlGetNsList(docPtr: number, nodePtr: number): number[] {
  const nsPtr = libxml2._xmlGetNsList(docPtr, nodePtr);

  if (nsPtr === 0) {
    return [];
  }

  const nsPtrList: number[] = [];

  for (let offset = nsPtr / libxml2.HEAP32.BYTES_PER_ELEMENT; libxml2.HEAP32[offset]; offset++) {
    nsPtrList.push(libxml2.HEAP32[offset]);
  }

  libxml2._free(nsPtr);

  return nsPtrList;
}

export function xmlSearchNs(docPtr: number, nodePrt: number, prefix: string | null): number {
  const prefixPtr = string2pointer(prefix).ptr;

  const xmlSearchNsPtr = libxml2._xmlSearchNs(docPtr, nodePrt, prefixPtr);

  libxml2._free(prefixPtr);

  return xmlSearchNsPtr;
}

export function xmlXPathCtxtCompile(ctxtPtr: number, value: string): number {
  const valuePtr = string2pointer(value).ptr;

  const xmlXPathCtxtCompilePtr = libxml2._xmlXPathCtxtCompile(ctxtPtr, valuePtr);

  libxml2._free(valuePtr);

  return xmlXPathCtxtCompilePtr;
}


export class XmlXPathObjectStruct {
  static type = getValueFunc(0, 'i32');

  static nodesetval = getValueFunc(4, '*');

  static boolval = getValueFunc(8, 'i32');

  static floatval = getValueFunc(12, 'double');

  static stringval = getStringValueFunc(20);
}

export namespace XmlXPathObjectStruct {
  export enum Type {
    XPATH_NODESET = 1,
    XPATH_BOOLEAN = 2,
    XPATH_NUMBER = 3,
    XPATH_STRING = 4,
  }
}

export class XmlNodeSetStruct {
  static nodeCount = getValueFunc(0, 'i32');

  static nodeTable(nodeSetPtr: number, size: number) {
    const tablePtr = libxml2.getValue(nodeSetPtr + 8, '*') / libxml2.HEAP32.BYTES_PER_ELEMENT;
    return libxml2.HEAP32.subarray(tablePtr, tablePtr + size);
  }
}

export class XmlTreeCommonStruct {
  static type = getValueFunc(4, 'i32');

  static nameValue = getStringValueFunc(8);

  static children = getValueFunc(12, '*');

  static last = getValueFunc(16, '*');

  static parent = getValueFunc(20, '*');

  static next = getValueFunc(24, '*');

  static prev = getValueFunc(28, '*');

  static doc = getValueFunc(32, '*');
}

export class XmlNamedNodeStruct extends XmlTreeCommonStruct {
  static namespace = getValueFunc(36, '*');
}

export class XmlNodeStruct extends XmlNamedNodeStruct {
  static properties = getValueFunc(44, '*');

  static nsDef = getValueFunc(48, '*');

  static line = getValueFunc(56, 'i32');
}

export namespace XmlNodeStruct {
  export enum Type {
    XML_ELEMENT_NODE = 1,
    XML_ATTRIBUTE_NODE = 2,
    XML_TEXT_NODE = 3,
    XML_CDATA_SECTION_NODE = 4,
    XML_COMMENT_NODE = 8,
  }
}

export class XmlNsStruct {
  static next = getValueFunc(0, '*');

  static href = getStringValueFunc(8);

  static prefix = getStringValueFunc(12);
}

export class XmlAttrStruct extends XmlTreeCommonStruct {
}

export class XmlErrorStruct {
  static message = getStringValueFunc(8);

  static file = getNullableStringValueFunc(16);

  static line = getValueFunc(20, 'i32');

  static col = getValueFunc(40, 'i32');
}

export function xmlCleanupInputProvider(): void {
  libxml2._xmlCleanupInputCallbacks();
}
export const xmlCtxtSetErrorHandler = libxml2._xmlCtxtSetErrorHandler;
export const xmlDocGetRootElement = libxml2._xmlDocGetRootElement;
export const xmlFreeDoc = libxml2._xmlFreeDoc;
export const xmlFreeNode = libxml2._xmlFreeNode;
export const xmlFreeParserCtxt = libxml2._xmlFreeParserCtxt;
export const xmlNewParserCtxt = libxml2._xmlNewParserCtxt;
export const xmlRemoveProp = libxml2._xmlRemoveProp;
export const xmlUnlinkNode = libxml2._xmlUnlinkNode;
export const xmlXIncludeFreeContext = libxml2._xmlXIncludeFreeContext;
export const xmlXIncludeNewContext = libxml2._xmlXIncludeNewContext;
export const xmlXIncludeProcessNode = libxml2._xmlXIncludeProcessNode;
export const xmlXIncludeSetErrorHandler = libxml2._xmlXIncludeSetErrorHandler;
export const xmlXPathCompiledEval = libxml2._xmlXPathCompiledEval;
export const xmlXPathFreeCompExpr = libxml2._xmlXPathFreeCompExpr;
export const xmlXPathFreeContext = libxml2._xmlXPathFreeContext;
export const xmlXPathFreeObject = libxml2._xmlXPathFreeObject;
export const xmlXPathNewContext = libxml2._xmlXPathNewContext;
export const xmlXPathSetContextNode = libxml2._xmlXPathSetContextNode;
