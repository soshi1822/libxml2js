import {
  xmlCtxtSetErrorHandler,
  xmlDocGetRootElement,
  XmlError,
  XmlErrorCollector,
  xmlFreeDoc,
  xmlFreeParserCtxt,
  xmlNewParserCtxt,
  xmlReadMemory,
  xmlXIncludeFreeContext,
  xmlXIncludeNewContext,
  xmlXIncludeProcessNode,
  xmlXIncludeSetErrorHandler
} from './wasm.mjs';
import { Dispose } from './dispose.mjs';
import { XmlElement, XmlNode } from './node.mjs';
import { NamespaceMap, XmlXPath } from './xpath.mjs';

export enum ParseOption {
  XML_PARSE_DEFAULT = 0,
  XML_PARSE_RECOVER = 1 << 0,
  XML_PARSE_NOENT = 1 << 1,
  XML_PARSE_DTDLOAD = 1 << 2,
  XML_PARSE_DTDATTR = 1 << 3,
  XML_PARSE_DTDVALID = 1 << 4,
  XML_PARSE_NOERROR = 1 << 5,
  XML_PARSE_NOWARNING = 1 << 6,
  XML_PARSE_PEDANTIC = 1 << 7,
  XML_PARSE_NOBLANKS = 1 << 8,
  XML_PARSE_SAX1 = 1 << 9,
  XML_PARSE_XINCLUDE = 1 << 10,
  XML_PARSE_NONET = 1 << 11,
  XML_PARSE_NODICT = 1 << 12,
  XML_PARSE_NSCLEAN = 1 << 13,
  XML_PARSE_NOCDATA = 1 << 14,
  XML_PARSE_NOXINCNODE = 1 << 15,
  XML_PARSE_COMPACT = 1 << 16,
  XML_PARSE_OLD10 = 1 << 17,
  XML_PARSE_NOBASEFIX = 1 << 18,
  XML_PARSE_HUGE = 1 << 19,
  XML_PARSE_OLDSAX = 1 << 20,
  XML_PARSE_IGNORE_ENC = 1 << 21,
  XML_PARSE_BIG_LINES = 1 << 22,
  XML_PARSE_NO_XXE = 1 << 23,
}

export interface ParseOptions {
  url?: string;
  encoding?: string;
  option?: ParseOption;
}

function parse(data: string | Uint8Array, url?: string, option?: ParseOption) {
  const ctxtPtr = xmlNewParserCtxt();

  const parseErr = XmlErrorCollector.create();
  xmlCtxtSetErrorHandler(ctxtPtr, XmlErrorCollector.errorEventCatchPtr, parseErr);

  const docPtr = xmlReadMemory(
    ctxtPtr,
    data,
    url ?? null,
    null,
    option ?? (ParseOption.XML_PARSE_NOBLANKS | ParseOption.XML_PARSE_NO_XXE)
  );

  xmlFreeParserCtxt(ctxtPtr);

  if (!docPtr) {
    const errDetails = XmlErrorCollector.get(parseErr);
    XmlErrorCollector.delete(parseErr);

    throw new XmlError(errDetails.map((d) => d.message).join(''), errDetails);
  }

  XmlErrorCollector.delete(parseErr);

  const incErr = XmlErrorCollector.create();

  const xincPtr = xmlXIncludeNewContext(docPtr);

  xmlXIncludeSetErrorHandler(xincPtr, XmlErrorCollector.errorEventCatchPtr, incErr);

  if (xmlXIncludeProcessNode(xincPtr, docPtr) < 0) {
    const errDetails = XmlErrorCollector.get(incErr);
    XmlErrorCollector.delete(incErr);
    xmlXIncludeFreeContext(xincPtr);

    throw new XmlError(errDetails.map((d) => d.message).join(''), errDetails);
  }

  XmlErrorCollector.delete(incErr);
  xmlXIncludeFreeContext(xincPtr);

  return docPtr;
}

export class XmlDocument extends Dispose {
  #root = new XmlElement(xmlDocGetRootElement(this.ptr));

  constructor(xmlPtr: number) {
    super(xmlPtr, xmlFreeDoc);
  }

  get root(): XmlElement {
    return this.#root;
  }

  static from(data: Uint8Array | string, options: ParseOptions = {}): XmlDocument {
    return new XmlDocument(parse(data, options.url, options.option));
  }

  xpathGet(xpath: XmlXPath): XmlNode | null;
  xpathGet(xpath: string, namespaces?: NamespaceMap): XmlNode | null;
  xpathGet(xpath: string | XmlXPath, namespaces?: NamespaceMap): XmlNode | null {
    return this.root.xpathGet(xpath, namespaces);
  }

  xpathFind(xpath: XmlXPath): XmlNode[];
  xpathFind(xpath: string, namespaces?: NamespaceMap): XmlNode[];
  xpathFind(xpath: string | XmlXPath, namespaces?: NamespaceMap): XmlNode[] {
    return this.root.xpathFind(xpath, namespaces);
  }
}
