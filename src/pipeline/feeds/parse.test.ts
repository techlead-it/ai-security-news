import { describe, it, expect } from "vite-plus/test";
import { parseFeed } from "./parse";

const RSS = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Example Feed</title>
    <item>
      <title>First &amp; foremost</title>
      <link>https://example.com/first</link>
      <guid isPermaLink="false">guid-1</guid>
      <pubDate>Wed, 17 Jun 2026 09:00:00 GMT</pubDate>
      <description>&lt;p&gt;An &lt;b&gt;excerpt&lt;/b&gt;&lt;/p&gt;</description>
    </item>
    <item>
      <title>Second</title>
      <link>https://example.com/second</link>
      <pubDate>Tue, 16 Jun 2026 09:00:00 GMT</pubDate>
      <description>Plain excerpt</description>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Example</title>
  <entry>
    <title>Atom entry</title>
    <link rel="alternate" href="https://example.org/entry"/>
    <id>tag:example.org,2026:entry</id>
    <updated>2026-06-15T12:00:00Z</updated>
    <summary>Atom summary text</summary>
  </entry>
</feed>`;

describe("parseFeed", () => {
  it("extracts items from an RSS 2.0 feed", () => {
    const items = parseFeed(RSS, "Example Feed");
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      url: "https://example.com/first",
      guid: "guid-1",
      source: "Example Feed",
      title: "First & foremost",
      excerpt: "An excerpt",
      publishedAt: "2026-06-17T09:00:00.000Z",
    });
  });

  it("uses the link as guid fallback when guid is absent", () => {
    const items = parseFeed(RSS, "Example Feed");
    expect(items[1].guid).toBeNull();
    expect(items[1].url).toBe("https://example.com/second");
  });

  it("extracts entries from an Atom feed", () => {
    const items = parseFeed(ATOM, "Atom Example");
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      url: "https://example.org/entry",
      guid: "tag:example.org,2026:entry",
      source: "Atom Example",
      title: "Atom entry",
      excerpt: "Atom summary text",
      publishedAt: "2026-06-15T12:00:00.000Z",
    });
  });

  it("falls back to dc:date when pubDate is absent", () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel><title>F</title>
    <item>
      <title>T</title>
      <link>https://e.com/1</link>
      <dc:date>2026-06-10T03:00:00Z</dc:date>
      <description>d</description>
    </item>
  </channel>
</rss>`;
    const items = parseFeed(xml, "F");
    expect(items[0].publishedAt).toBe("2026-06-10T03:00:00.000Z");
  });

  it("keeps the link as url even when guid has isPermaLink=false", () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>F</title>
<item>
  <title>T</title>
  <link>https://e.com/post-1</link>
  <guid isPermaLink="false">tag:e.com,2026:abc</guid>
  <pubDate>Wed, 17 Jun 2026 09:00:00 GMT</pubDate>
  <description>d</description>
</item>
</channel></rss>`;
    const items = parseFeed(xml, "F");
    expect(items[0].url).toBe("https://e.com/post-1");
    expect(items[0].guid).toBe("tag:e.com,2026:abc");
  });

  it("strips HTML markup and decodes entities from RSS titles", () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>F</title>
<item><title>Breaking Opus 4.7 with ChatGPT (Hacking Claude&#39;s Memory)</title>
<link>https://x/1</link><description>d</description></item>
</channel></rss>`;
    const items = parseFeed(xml, "F");
    expect(items[0].title).toBe(
      "Breaking Opus 4.7 with ChatGPT (Hacking Claude's Memory)",
    );
  });

  it("strips HTML markup from Atom titles with type=html", () => {
    const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>F</title>
  <entry>
    <title type="html">Why &lt;b&gt;LLM&lt;/b&gt; security matters</title>
    <link rel="alternate" href="https://e/1"/>
    <id>id-1</id>
    <updated>2026-06-15T12:00:00Z</updated>
    <summary>s</summary>
  </entry>
</feed>`;
    const items = parseFeed(atom, "F");
    expect(items[0].title).toBe("Why LLM security matters");
  });

  it("picks the rel=alternate text/html link over replies/self/edit for Atom entries", () => {
    // Google Security Blog (Blogger) のように entry に複数 link がある場合、
    // 先頭が rel="replies" の comments フィードでも本文 HTML を採用する。
    const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Google Security Blog</title>
  <entry>
    <title>AI threats in the wild</title>
    <id>tag:blogger.com,1999:blog-1.post-2</id>
    <updated>2026-04-23T21:38:06Z</updated>
    <link href="http://security.googleblog.com/feeds/2/comments/default" rel="replies" type="application/atom+xml"/>
    <link href="http://www.blogger.com/comment/fullpage/post/1/2" rel="replies" type="text/html"/>
    <link href="http://www.blogger.com/feeds/1/posts/default/2" rel="edit" type="application/atom+xml"/>
    <link href="http://www.blogger.com/feeds/1/posts/default/2" rel="self" type="application/atom+xml"/>
    <link href="http://security.googleblog.com/2026/04/ai-threats-in-wild.html" rel="alternate" title="AI threats in the wild" type="text/html"/>
    <summary>s</summary>
  </entry>
</feed>`;
    const items = parseFeed(atom, "Google Security Blog");
    expect(items[0].url).toBe(
      "http://security.googleblog.com/2026/04/ai-threats-in-wild.html",
    );
  });

  it("falls back to a rel-less Atom link (which is alternate per spec)", () => {
    const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>F</title>
  <entry>
    <title>T</title>
    <id>id-1</id>
    <updated>2026-06-15T12:00:00Z</updated>
    <link href="https://e/post"/>
    <summary>s</summary>
  </entry>
</feed>`;
    const items = parseFeed(atom, "F");
    expect(items[0].url).toBe("https://e/post");
  });

  it("prefers Atom content over summary when both are present", () => {
    const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>F</title>
  <entry>
    <title>E</title>
    <link rel="alternate" href="https://e/1"/>
    <id>id-1</id>
    <updated>2026-06-15T12:00:00Z</updated>
    <summary>short summary</summary>
    <content>much longer full body content</content>
  </entry>
</feed>`;
    const items = parseFeed(atom, "F");
    expect(items[0].excerpt).toBe("much longer full body content");
  });
});
