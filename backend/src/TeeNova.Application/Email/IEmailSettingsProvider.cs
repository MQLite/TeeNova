using System.Threading.Tasks;

namespace TeeNova.Email;

public interface IEmailSettingsProvider
{
    Task<EmailSettingsSnapshot> GetEffectiveSettingsAsync();
}
