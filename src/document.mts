import {
  htmlFreeParserCtxt,
  htmlNewParserCtxt,
  htmlReadMemory,
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

export enum XmlParseOption {
  XML_PARSE_RECOVER = 1,
  XML_PARSE_NOENT = 2,
  XML_PARSE_DTDLOAD = 4,
  XML_PARSE_DTDATTR = 8,
  XML_PARSE_DTDVALID = 16,
  XML_PARSE_NOERROR = 32,
  XML_PARSE_NOWARNING = 64,
  XML_PARSE_PEDANTIC = 128,
  XML_PARSE_NOBLANKS = 256,
  XML_PARSE_SAX1 = 512,
  XML_PARSE_XINCLUDE = 1024,
  XML_PARSE_NONET = 2048,
  XML_PARSE_NODICT = 4096,
  XML_PARSE_NSCLEAN = 8192,
  XML_PARSE_NOCDATA = 16384,
  XML_PARSE_NOXINCNODE = 32768,
  XML_PARSE_COMPACT = 65536,
  XML_PARSE_OLD10 = 131072,
  XML_PARSE_NOBASEFIX = 262144,
  XML_PARSE_HUGE = 524288,
  XML_PARSE_OLDSAX = 1048576,
  XML_PARSE_IGNORE_ENC = 2097152,
  XML_PARSE_BIG_LINES = 4194304,
  XML_PARSE_NO_XXE = 8388608
}

export enum HtmlParseOption {
  HTML_PARSE_RECOVER = 1,
  HTML_PARSE_NODEFDTD = 4,
  HTML_PARSE_NOERROR = 32,
  HTML_PARSE_NOWARNING = 64,
  HTML_PARSE_PEDANTIC = 128,
  HTML_PARSE_NOBLANKS = 256,
  HTML_PARSE_NONET = 2048,
  HTML_PARSE_NOIMPLIED = 8192,
  HTML_PARSE_COMPACT = 65536,
  HTML_PARSE_IGNORE_ENC = 2097152
}

export interface XmlParseOptions {
  mode?: 'xml';
  url?: string;
  encoding?: string;
  option?: XmlParseOption;
}

export interface HtmlParseOptions {
  mode: 'html';
  url?: string;
  encoding?: string;
  option?: HtmlParseOption;
}

function xmlParse(data: string | Uint8Array, url?: string, option?: XmlParseOption) {
  const ctxtPtr = xmlNewParserCtxt();

  const parseErr = XmlErrorCollector.create();
  xmlCtxtSetErrorHandler(ctxtPtr, XmlErrorCollector.errorEventCatchPtr, parseErr);

  const docPtr = xmlReadMemory(
    ctxtPtr,
    data,
    url ?? null,
    null,
    option ?? (XmlParseOption.XML_PARSE_NOBLANKS | XmlParseOption.XML_PARSE_NO_XXE)
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

function htmlParse(data: string | Uint8Array, url?: string, option?: HtmlParseOption) {
  const ctxtPtr = htmlNewParserCtxt();

  const parseErr = XmlErrorCollector.create();
  xmlCtxtSetErrorHandler(ctxtPtr, XmlErrorCollector.errorEventCatchPtr, parseErr);

  const docPtr = htmlReadMemory(
    ctxtPtr,
    data,
    url ?? null,
    null,
    option ?? HtmlParseOption.HTML_PARSE_NOBLANKS
  );

  htmlFreeParserCtxt(ctxtPtr);

  if (!docPtr) {
    const errDetails = XmlErrorCollector.get(parseErr);
    XmlErrorCollector.delete(parseErr);

    throw new XmlError(errDetails.map((d) => d.message).join(''), errDetails);
  }

  XmlErrorCollector.delete(parseErr);

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

  static from(data: Uint8Array | string, options: (XmlParseOptions | HtmlParseOptions) = {}): XmlDocument {
    if (options.mode === 'html') {
      return new XmlDocument(htmlParse(data, options.url, options.option));
    }

    return new XmlDocument(xmlParse(data, options.url, options.option));
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
