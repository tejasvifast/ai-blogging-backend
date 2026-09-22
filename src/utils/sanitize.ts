import DOMPurify from 'isomorphic-dompurify'

/**
 * Sanitize AI-generated (or otherwise untrusted) HTML before persisting or
 * serving it. Allows the tags a blog article legitimately needs and strips
 * scripts, event handlers, iframes, etc.
 */
const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr', 'blockquote', 'pre', 'code',
  'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'sub', 'sup',
  'ul', 'ol', 'li',
  'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'span', 'div',
]

const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'width', 'height', 'class', 'id', 'target', 'rel']

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Block javascript: / data: URIs on links.
    ALLOWED_URI_REGEXP: /^(?:https?|mailto|tel):|^\/[^/]/i,
  })
}
