using Microsoft.EntityFrameworkCore;
using Nexus.Domain.Entities;

namespace Nexus.Persistence;

public class NexusDbContext(DbContextOptions<NexusDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<UserDailyUsage> UserDailyUsages => Set<UserDailyUsage>();
    public DbSet<KnowledgeSource> KnowledgeSources => Set<KnowledgeSource>();
    public DbSet<Document> Documents => Set<Document>();
    public DbSet<DocumentChunk> DocumentChunks => Set<DocumentChunk>();
    public DbSet<Tag> Tags => Set<Tag>();
    public DbSet<DocumentTag> DocumentTags => Set<DocumentTag>();
    public DbSet<Interaction> Interactions => Set<Interaction>();
    public DbSet<ConversationSession> ConversationSessions => Set<ConversationSession>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Role).HasConversion<string>();
            entity.HasIndex(e => e.SlackUserId).IsUnique();
        });

        modelBuilder.Entity<UserDailyUsage>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.UserId, e.Date }).IsUnique();
        });

        modelBuilder.Entity<KnowledgeSource>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Type).HasConversion<string>();
        });

        modelBuilder.Entity<Document>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.ContentType).HasConversion<string>();
            entity.Property(e => e.Status).HasConversion<string>();
            entity.HasIndex(e => new { e.SourceId, e.ExternalId }).IsUnique();
        });

        modelBuilder.Entity<DocumentChunk>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.DocumentId, e.ChunkIndex });
        });

        modelBuilder.Entity<Tag>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.Slug).IsUnique();
        });

        modelBuilder.Entity<DocumentTag>(entity =>
        {
            entity.HasKey(e => new { e.DocumentId, e.TagId });
        });

        modelBuilder.Entity<Interaction>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Status).HasConversion<string>();
            entity.Property(e => e.EstimatedCostUsd).HasPrecision(18, 6);
            entity.HasIndex(e => e.SlackEventId).IsUnique();
            entity.HasIndex(e => new { e.ConversationSessionId, e.SessionWindowNumber });
        });

        modelBuilder.Entity<ConversationSession>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.SessionKey).IsUnique();
        });
    }
}
