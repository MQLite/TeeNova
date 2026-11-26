using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Uow;

namespace TeeNova.Reception;

// Read committed work from the one configured test sheet. A failed Send API call
// leaves the reply pending for a later attempt, independently of webhook retries.
public sealed class MessengerTrialReplyWorker(IServiceScopeFactory scopes, IConfiguration configuration,
    ILogger<MessengerTrialReplyWorker> logger) : BackgroundService
{
    private static readonly HttpClient Client = new(new SocketsHttpHandler { AllowAutoRedirect = false, UseCookies = false })
        { Timeout = TimeSpan.FromSeconds(5) };

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var trial = configuration.GetSection("MessengerTrial");
        var token = trial["PageAccessToken"];
        var recipient = trial["StaffPsid"];
        if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(recipient) ||
            !Guid.TryParse(trial["SheetId"], out var sheetId) || sheetId == Guid.Empty) return;
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(10));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var services = scope.ServiceProvider;
                using var work = services.GetRequiredService<IUnitOfWorkManager>().Begin(requiresNew: true);
                var sheets = services.GetRequiredService<IRepository<ReceptionSheet, Guid>>();
                var sheet = await sheets.FindAsync(sheetId, cancellationToken: stoppingToken);
                if (sheet?.Customer != MessengerTrialArtwork.SheetName || sheet.NextTrialReply() is not { } reply) continue;
                using var request = new HttpRequestMessage(HttpMethod.Post,
                    $"https://graph.facebook.com/v27.0/{MessengerTrialController.PageId}/messages");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                request.Content = JsonContent.Create(new { recipient = new { id = recipient },
                    messaging_type = "RESPONSE", message = new { text = reply.Text } });
                using var response = await Client.SendAsync(request, stoppingToken);
                if (!response.IsSuccessStatusCode)
                {
                    logger.LogWarning("Messenger trial reply is pending. Meta returned {Status}.", (int)response.StatusCode);
                    await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
                    continue;
                }
                sheet.MarkTrialReplySent(reply.Stage);
                await sheets.UpdateAsync(sheet, cancellationToken: stoppingToken);
                await work.CompleteAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception e)
            {
                logger.LogWarning("Messenger trial reply deferred ({ErrorType}).", e.GetType().Name);
            }
        }
    }
}
