using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Volo.Abp.Application.Services;

namespace TeeNova.Payments;

public interface IOnlinePaymentWebhookAppService : IApplicationService
{
    Task HandleWebhookAsync(
        string                              provider,
        string                              rawBody,
        IReadOnlyDictionary<string, string> headers,
        CancellationToken                   cancellationToken = default);
}
