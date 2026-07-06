using System.Text.RegularExpressions;

namespace Nexus.Slack;

public static partial class SlackMessageFormatter
{
    public static string ToSlackMrkdwn(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return text;
        }

        // O Slack usa *texto* para negrito; muitos LLMs respondem com **texto**.
        var formatted = BoldMarkdownRegex().Replace(text, "*$1*");

        // Evita links em markdown bruto; o Slack nem sempre os renderiza como esperado
        // dependendo da origem do texto.
        return MarkdownLinkRegex().Replace(formatted, "$1 ($2)");
    }

    [GeneratedRegex(@"\*\*(.+?)\*\*")]
    private static partial Regex BoldMarkdownRegex();

    [GeneratedRegex(@"\[([^\]]+)\]\(([^)]+)\)")]
    private static partial Regex MarkdownLinkRegex();
}
