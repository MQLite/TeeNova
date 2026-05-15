using System.Threading.Tasks;
using TeeNova.Orders;

namespace TeeNova.Email;

public interface IOrderEmailNotificationService
{
    Task SendOrderConfirmationAsync(Order order);
    Task SendAdminNewOrderNotificationAsync(Order order);
    Task SendOrderReadyAsync(Order order);
    Task SendOrderCompletedAsync(Order order);
}
