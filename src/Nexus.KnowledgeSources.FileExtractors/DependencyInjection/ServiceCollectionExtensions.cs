using Microsoft.Extensions.DependencyInjection;
using Nexus.KnowledgeSources.Abstractions;

namespace Nexus.KnowledgeSources.FileExtractors.DependencyInjection;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddFileContentExtractors(this IServiceCollection services)
    {
        services.AddScoped<IFileContentExtractor, MarkdownFileContentExtractor>();
        services.AddScoped<IFileContentExtractor, PdfFileContentExtractor>();
        services.AddScoped<IFileContentExtractorFactory, FileContentExtractorFactory>();

        return services;
    }
}
