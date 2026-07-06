using Nexus.Domain.Enums;

namespace Nexus.Domain.Entities;

public class User
{
    public Guid Id { get; set; }
    public string SlackUserId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Email { get; set; }
    public UserRole Role { get; set; } = UserRole.Common;
    public bool Active { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
