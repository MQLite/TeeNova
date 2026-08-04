using System.Text.Json.Nodes;

namespace TeeNova.AiOrderImports.Recognition;

/// <summary>
/// Adapts the canonical extraction schema to OpenAI's strict Structured Outputs.
///
/// The adaptation is deliberately minimal. Constraint keywords are what make the model
/// emit the exact shapes the structural validator demands — dropping "pattern" from the
/// money fields, for instance, lets a model return "100" instead of "100.00" and fails the
/// whole extraction. Every keyword the canonical schema uses was confirmed supported
/// against the live API; only genuinely rejected keywords are removed here.
/// </summary>
public static class OpenAiStrictSchema
{
    /// <summary>
    /// Confirmed rejected by the API with "'x' is not permitted". None are used by the
    /// canonical schema today; they are stripped so adding one later degrades the request
    /// instead of breaking it outright.
    /// </summary>
    private static readonly HashSet<string> UnsupportedKeywords = new(StringComparer.Ordinal)
    {
        "uniqueItems",
        "minProperties",
        "maxProperties",
        "patternProperties",
        "propertyNames",
        "contains",
        "minContains",
        "maxContains",
        "unevaluatedItems",
        "unevaluatedProperties",
        "dependentRequired",
        "dependentSchemas",
        "if",
        "then",
        "else",
        "allOf",
        "not",
    };

    /// <summary>Keys whose values are name-to-schema maps, not schemas themselves.</summary>
    private static readonly HashSet<string> SchemaMaps = new(StringComparer.Ordinal)
    {
        "properties",
        "$defs",
        "definitions",
    };

    public static JsonNode Sanitize(string json) =>
        SanitizeSchema(JsonNode.Parse(json)) ??
        throw new ArgumentException("The recognition schema is not valid JSON.", nameof(json));

    private static JsonNode? SanitizeSchema(JsonNode? node)
    {
        switch (node)
        {
            case JsonObject source:
                if (TrySplitComplexNullable(source, out var union))
                    return union;
                var schema = new JsonObject();
                foreach (var (key, value) in source)
                {
                    if (UnsupportedKeywords.Contains(key))
                        continue;
                    schema[key] = SchemaMaps.Contains(key)
                        ? SanitizeSchemaMap(value)
                        : SanitizeSchema(value);
                }
                RequireDeclaredType(schema);
                return schema;
            case JsonArray source:
                var items = new JsonArray();
                foreach (var item in source)
                    items.Add(SanitizeSchema(item));
                return items;
            default:
                return node?.DeepClone();
        }
    }

    /// <summary>
    /// Strict mode rejects an untyped schema — "schema must have a 'type' key" — so an
    /// open <c>{}</c> value (the extraction contract uses one for an alternative reading,
    /// which the structural validator deliberately leaves unconstrained) becomes an explicit
    /// scalar union. Object and array are omitted: strict mode would then demand properties
    /// and items that an open value cannot supply.
    /// </summary>
    private static void RequireDeclaredType(JsonObject schema)
    {
        if (schema.ContainsKey("type") ||
            schema.ContainsKey("$ref") ||
            schema.ContainsKey("anyOf") ||
            schema.ContainsKey("enum") ||
            schema.ContainsKey("const"))
            return;
        schema["type"] = new JsonArray("string", "number", "boolean", "null");
    }

    /// <summary>
    /// Rewrites a nullable array or object — <c>"type":["array","null"]</c> — as
    /// <c>anyOf[&lt;the schema&gt;, {"type":"null"}]</c>.
    ///
    /// Confirmed against the live API by bisection: the full schema is rejected with the
    /// union spelling and accepted with this one, with every other keyword held constant.
    /// A minimal schema accepts either spelling, so the constraint only shows up in the
    /// real schema — do not "simplify" this away on the strength of an isolated test.
    /// Scalar unions such as <c>["string","null"]</c> are accepted as written.
    /// </summary>
    private static bool TrySplitComplexNullable(JsonObject source, out JsonObject? union)
    {
        union = null;
        if (source["type"] is not JsonArray types || types.Count != 2)
            return false;
        var names = types.Select(item => item?.GetValue<string>()).ToArray();
        if (!names.Contains("null"))
            return false;
        var concrete = names.FirstOrDefault(name => name != "null");
        if (concrete is not ("array" or "object"))
            return false;

        var inner = new JsonObject { ["type"] = concrete };
        foreach (var (key, value) in source)
        {
            if (key == "type" || UnsupportedKeywords.Contains(key))
                continue;
            inner[key] = SchemaMaps.Contains(key)
                ? SanitizeSchemaMap(value)
                : SanitizeSchema(value);
        }
        union = new JsonObject
        {
            ["anyOf"] = new JsonArray(inner, new JsonObject { ["type"] = "null" }),
        };
        return true;
    }

    /// <summary>
    /// Recurses into values only. A property legitimately named "pattern" or "format" is a
    /// field of the extraction contract, not a validation keyword, and must survive.
    /// </summary>
    private static JsonNode? SanitizeSchemaMap(JsonNode? node)
    {
        if (node is not JsonObject map)
            return SanitizeSchema(node);
        var sanitized = new JsonObject();
        foreach (var (name, value) in map)
            sanitized[name] = SanitizeSchema(value);
        return sanitized;
    }
}
