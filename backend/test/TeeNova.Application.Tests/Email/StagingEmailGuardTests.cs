using Microsoft.Extensions.Options;
using TeeNova.Email;

namespace TeeNova.Email;

/// <summary>
/// Unit tests for the Jira 9908.2 staging outbound-email guard. Pure/host-independent: the guard is
/// constructed directly with an <see cref="EmailStagingOptions"/> instance. These cover the required
/// Phase 3 behaviours (production passthrough, staging decoration, recipient rewrite, fail-closed,
/// idempotency, log masking).
/// </summary>
public sealed class StagingEmailGuardTests
{
    private const string ProdSender  = "Otahuhu Printing";
    private const string ProdFrom    = "noreply@otahuhuprint.com";
    private const string ProdReplyTo = "shop@otahuhuprint.com";

    private const string Subject = "Order Confirmation — Order #TN-10234";
    private const string Html    = "<div><p>Thanks for your order #TN-10234.</p></div>";
    private const string Text    = "Thanks for your order #TN-10234.";

    private static StagingEmailGuard Guard(EmailStagingOptions o) =>
        new(Options.Create(o));

    private static StagingEmailDecision Apply(StagingEmailGuard g, string recipient) =>
        g.Apply(recipient, Subject, Html, Text, ProdSender, ProdFrom, ProdReplyTo);

    // ── Production mode (Mode=false): unchanged behaviour ─────────────────────────────────────────────

    [Fact]
    public void Production_mode_is_a_faithful_passthrough()
    {
        var g = Guard(new EmailStagingOptions { Mode = false });

        var d = Apply(g, "customer@example.com");

        Assert.False(d.Blocked);
        Assert.NotNull(d.Email);
        Assert.Equal("customer@example.com", d.Email!.Recipient);
        Assert.Equal(Subject, d.Email.Subject);
        Assert.Equal(Html, d.Email.HtmlBody);
        Assert.Equal(Text, d.Email.TextBody);
        Assert.Equal(ProdSender, d.Email.SenderName);
        Assert.Equal(ProdFrom, d.Email.SenderAddress);
        Assert.Equal(ProdReplyTo, d.Email.ReplyTo);
        Assert.DoesNotContain("STAGING TEST", d.Email.Subject);
        Assert.DoesNotContain("STAGING TEST EMAIL", d.Email.HtmlBody);
    }

    [Fact]
    public void Production_mode_ForLog_returns_original_recipient()
    {
        var g = Guard(new EmailStagingOptions { Mode = false });
        Assert.Equal("customer@example.com", g.ForLog("customer@example.com"));
    }

    // ── Staging mode (Mode=true): decoration + rewrite ────────────────────────────────────────────────

    [Fact]
    public void Staging_mode_rewrites_recipient_and_decorates_message()
    {
        var g = Guard(new EmailStagingOptions
        {
            Mode = true,
            RecipientOverride = "qa@internal.test",
            SenderAddress = "staging@otahuhuprint.com",
            SenderName = "TeeNova Staging",
            ReplyTo = "staging-qa@internal.test",
        });

        var d = Apply(g, "customer@example.com");

        Assert.False(d.Blocked);
        Assert.NotNull(d.Email);
        var e = d.Email!;

        // Recipient rewritten to the approved test mailbox; original never used.
        Assert.Equal("qa@internal.test", e.Recipient);
        Assert.DoesNotContain("customer@example.com", e.Recipient);

        // Subject prefixed exactly once.
        Assert.StartsWith("[STAGING TEST] ", e.Subject);
        Assert.Contains("Order Confirmation", e.Subject);

        // Formal business content preserved.
        Assert.Contains("Thanks for your order #TN-10234.", e.HtmlBody);
        Assert.Contains("Thanks for your order #TN-10234.", e.TextBody);

        // Visible HTML banner + plain-text warning + footer.
        Assert.Contains("STAGING TEST EMAIL", e.HtmlBody);
        Assert.Contains("*** STAGING TEST EMAIL ***", e.TextBody);
        Assert.Contains("Environment: STAGING", e.HtmlBody);
        Assert.Contains("staging.otahuhuprint.com", e.HtmlBody);
        Assert.Contains("Environment: STAGING", e.TextBody);

        // Staging sender/reply-to applied.
        Assert.Equal("TeeNova Staging", e.SenderName);
        Assert.Equal("staging@otahuhuprint.com", e.SenderAddress);
        Assert.Equal("staging-qa@internal.test", e.ReplyTo);
    }

    [Fact]
    public void Staging_mode_falls_back_to_effective_sender_when_no_staging_sender_configured()
    {
        var g = Guard(new EmailStagingOptions { Mode = true, RecipientOverride = "qa@internal.test" });

        var e = Apply(g, "customer@example.com").Email!;

        // No staging sender configured → keep the effective (marked) sender; message is still clearly marked.
        Assert.Equal(ProdSender, e.SenderName);
        Assert.Equal(ProdFrom, e.SenderAddress);
        Assert.StartsWith("[STAGING TEST] ", e.Subject);
    }

    // ── Fail-closed ───────────────────────────────────────────────────────────────────────────────────

    [Fact]
    public void Staging_mode_blocks_when_no_override_or_allowlist_configured()
    {
        var g = Guard(new EmailStagingOptions { Mode = true }); // no override, no allowlist

        var d = Apply(g, "customer@example.com");

        Assert.True(d.Blocked);
        Assert.Null(d.Email);
        Assert.NotNull(d.BlockReason);
        // The block reason must not leak the original recipient.
        Assert.DoesNotContain("customer@example.com", d.BlockReason!);
    }

    [Fact]
    public void Staging_mode_never_falls_back_to_original_recipient()
    {
        var g = Guard(new EmailStagingOptions { Mode = true, AllowedDomains = new[] { "internal.test" } });

        // A non-allowlisted customer address with no override must be blocked, not delivered.
        var d = Apply(g, "customer@example.com");
        Assert.True(d.Blocked);
    }

    // ── Allowlist path ────────────────────────────────────────────────────────────────────────────────

    [Fact]
    public void Allowlisted_recipient_is_delivered_without_override()
    {
        var g = Guard(new EmailStagingOptions
        {
            Mode = true,
            AllowedRecipients = new[] { "ops@internal.test" },
        });

        var d = Apply(g, "ops@internal.test");

        Assert.False(d.Blocked);
        Assert.Equal("ops@internal.test", d.Email!.Recipient);
    }

    [Fact]
    public void Allowlisted_domain_is_delivered_without_override()
    {
        var g = Guard(new EmailStagingOptions
        {
            Mode = true,
            AllowedDomains = new[] { "internal.test" },
        });

        var d = Apply(g, "someone@internal.test");

        Assert.False(d.Blocked);
        Assert.Equal("someone@internal.test", d.Email!.Recipient);
    }

    // ── Idempotency ───────────────────────────────────────────────────────────────────────────────────

    [Fact]
    public void Decoration_is_idempotent()
    {
        var g = Guard(new EmailStagingOptions { Mode = true, RecipientOverride = "qa@internal.test" });

        var once = Apply(g, "customer@example.com").Email!;
        // Re-decorate the already-decorated content.
        var twice = g.Apply(once.Recipient, once.Subject, once.HtmlBody, once.TextBody,
            ProdSender, ProdFrom, ProdReplyTo).Email!;

        Assert.Equal(once.Subject, twice.Subject);
        Assert.DoesNotContain("[STAGING TEST] [STAGING TEST]", twice.Subject);
        Assert.Equal(CountOccurrences(once.HtmlBody, "STAGING TEST EMAIL"),
                     CountOccurrences(twice.HtmlBody, "STAGING TEST EMAIL"));
        Assert.Equal(CountOccurrences(once.TextBody, "*** STAGING TEST EMAIL ***"),
                     CountOccurrences(twice.TextBody, "*** STAGING TEST EMAIL ***"));
    }

    // ── Log masking ───────────────────────────────────────────────────────────────────────────────────

    [Fact]
    public void Staging_ForLog_masks_recipient()
    {
        var g = Guard(new EmailStagingOptions { Mode = true, RecipientOverride = "qa@internal.test" });
        Assert.Equal("c***@example.com", g.ForLog("customer@example.com"));
        Assert.Equal("(none)", g.ForLog(null));
    }

    private static int CountOccurrences(string haystack, string needle)
    {
        int count = 0, i = 0;
        while ((i = haystack.IndexOf(needle, i, System.StringComparison.Ordinal)) >= 0) { count++; i += needle.Length; }
        return count;
    }
}
