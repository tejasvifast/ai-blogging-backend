/**
 * Test stub for isomorphic-dompurify.
 *
 * The real package ships ESM (`export ...`) which the CommonJS ts-jest transform
 * can't parse, so importing it in tests throws "Unexpected token 'export'".
 * Sanitization behaviour isn't exercised by the integration/unit suites, so an
 * identity stub is sufficient here. Real sanitization runs in dev/prod (Node
 * handles the ESM interop fine outside jest).
 */
const DOMPurify = { sanitize: (dirty: string): string => dirty };
export default DOMPurify;
