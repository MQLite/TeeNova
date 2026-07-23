using System;

namespace TeeNova.Email;

/// <summary>
/// Staging outbound-email guard configuration (Jira 9908.2). Bound from the <c>Email:Staging</c>
/// configuration section — set exclusively via the staging environment file, never committed to
/// appsettings. When <see cref="Mode"/> is false (the default) the guard is a no-op and production
/// email behaviour is completely unchanged.
///
/// The guard is fail-closed: in staging mode, if neither <see cref="RecipientOverride"/> nor an
/// <see cref="AllowedRecipients"/>/<see cref="AllowedDomains"/> match exists for a message, the send is
/// blocked rather than delivered to the original (cloned production) customer address.
/// </summary>
public sealed class EmailStagingOptions
{
    public const string SectionName = "Email:Staging";

    /// <summary>Master switch. False (default) = production behaviour, guard disabled.</summary>
    public bool Mode { get; set; }

    /// <summary>Approved internal test mailbox that ALL staging email is rewritten to. Primary control.</summary>
    public string? RecipientOverride { get; set; }

    /// <summary>Explicit recipients that may receive staging email without being rewritten (already internal).</summary>
    public string[] AllowedRecipients { get; set; } = Array.Empty<string>();

    /// <summary>Domains whose recipients may receive staging email without being rewritten (e.g. internal domain).</summary>
    public string[] AllowedDomains { get; set; } = Array.Empty<string>();

    /// <summary>Subject marker, applied idempotently. Default "[STAGING TEST]".</summary>
    public string SubjectPrefix { get; set; } = "[STAGING TEST]";

    public bool BannerEnabled { get; set; } = true;
    public bool FooterEnabled { get; set; } = true;

    /// <summary>Staging sender address; falls back to the effective (marked) sender when unset.</summary>
    public string? SenderAddress { get; set; }
    public string? SenderName { get; set; }

    /// <summary>Approved internal staging Reply-To; falls back to the effective reply-to when unset.</summary>
    public string? ReplyTo { get; set; }

    /// <summary>Staging public base URL (documentation/footer only — links are config-derived, not rewritten here).</summary>
    public string? PublicBaseUrl { get; set; }

    /// <summary>Optional build SHA shown in the footer. Never include secrets/paths/connection strings.</summary>
    public string? BuildSha { get; set; }
}
