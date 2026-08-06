using System;
using System.Security.Cryptography;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Enquiries;

public interface IQuoteReferenceGenerator
{
    Task<string> CreateAsync(string prefix);
}

public sealed class QuoteReferenceGenerator : IQuoteReferenceGenerator, ITransientDependency
{
    private const string Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private readonly IRepository<QuoteRequest, Guid> _repository;
    public QuoteReferenceGenerator(IRepository<QuoteRequest, Guid> repository) => _repository = repository;

    public async Task<string> CreateAsync(string prefix)
    {
        prefix = string.IsNullOrWhiteSpace(prefix) ? "QR" : prefix.Trim().ToUpperInvariant();
        if (prefix.Length > 6) prefix = prefix[..6];
        for (var attempt = 0; attempt < 10; attempt++)
        {
            var bytes = new byte[6];
            RandomNumberGenerator.Fill(bytes);
            var suffix = new char[6];
            for (var i = 0; i < suffix.Length; i++) suffix[i] = Alphabet[bytes[i] % Alphabet.Length];
            var reference = $"{prefix}-{new string(suffix)}";
            if (!await _repository.AnyAsync(x => x.Reference == reference)) return reference;
        }
        throw new InvalidOperationException("Could not allocate a quote reference.");
    }
}
