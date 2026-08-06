import type { SchemaNode } from '@/lib/seo/structured-data/types'

/**
 * The one place structured data becomes markup (Jira 10308 Phase 26).
 *
 * A server component with no client JavaScript: the graph is serialized during rendering and shipped
 * as inline text, so structured data adds no bundle bytes, no hydration work and no network request.
 *
 * ## Why `dangerouslySetInnerHTML` is correct here, and safe
 *
 * A `<script>` element's content is raw text, not markup — React cannot set it through children
 * without escaping it into `&quot;`, which produces invalid JSON that no consumer can parse. So the
 * content has to be written directly, and the escaping has to be done deliberately.
 *
 * The one thing that can break out of a `<script>` block is the byte sequence `</script`, and the
 * HTML parser matches it case-insensitively without regard to JavaScript string quoting: putting it
 * inside a JSON string is not enough. `JSON.stringify` does not escape `<` or `>`, so a product
 * description containing `</script><img onerror=…>` would terminate the block and inject markup.
 *
 * {@link serializeJsonLd} therefore escapes `<`, `>` and `&` as `\uXXXX`. Those escapes are ordinary
 * JSON string escapes — `JSON.parse` restores the original characters exactly — so the data is
 * unchanged while the byte sequence that would end the element can no longer appear. U+2028 and
 * U+2029 are escaped for the same reason in the other direction: they are valid in JSON strings but
 * are line terminators to a JavaScript parser.
 *
 * The input is a typed object graph built by the `structured-data/` builders, never a caller-supplied
 * HTML string, so there is no path by which markup reaches this component un-serialized.
 */

/** JSON-LD text for a graph, escaped so it cannot terminate or escape its `<script>` element. */
export function serializeJsonLd(graph: readonly SchemaNode[]): string {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/**
 * Render a `@graph` of nodes as one `application/ld+json` block.
 *
 * One script element per page keeps the nodes in a single graph, so cross-references by `@id`
 * resolve without a consumer having to stitch several blocks together. Nothing is rendered when the
 * graph is empty — which is the normal outcome for a page whose facts are not approved, and is
 * preferable to an empty `@graph` that says "we have nothing to tell you" in 40 bytes.
 */
export function JsonLd({ graph }: { graph: readonly (SchemaNode | null)[] }) {
  const nodes = graph.filter((node): node is SchemaNode => node !== null)
  if (nodes.length === 0) return null
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger -- see the module comment: serializeJsonLd escapes
      // the only sequences that can break out of a script element, and the input is a typed graph.
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(nodes) }}
    />
  )
}
