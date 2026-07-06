using Nexus.Slack;

namespace Nexus.Tests.Slack;

public class SlackMessageFormatterTests
{
    [Fact]
    public void ToSlackMrkdwn_Converts_DoubleAsterisk_Bold_To_Slack_Bold()
    {
        var text = "- **Marco Epelman** (CEO)";

        var formatted = SlackMessageFormatter.ToSlackMrkdwn(text);

        Assert.Equal("- *Marco Epelman* (CEO)", formatted);
    }

    [Fact]
    public void ToSlackMrkdwn_Converts_Markdown_Links_To_Plain_Text_With_Url()
    {
        var text = "Rodada liderada pela [Investidores.vc](http://investidores.vc).";

        var formatted = SlackMessageFormatter.ToSlackMrkdwn(text);

        Assert.Equal("Rodada liderada pela Investidores.vc (http://investidores.vc).", formatted);
    }
}
