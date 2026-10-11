import { describe, expect, it } from "vitest";
import { linkify } from "./linkify";

const links = (text: string) => linkify(text).filter((piece) => piece.href).map((piece) => [piece.text, piece.href]);

describe("linkify", () => {
  it("finds full URLs and keeps the text around them", () => {
    expect(linkify("see https://example.com/a?b=1 now")).toEqual([
      { text: "see " }, { text: "https://example.com/a?b=1", href: "https://example.com/a?b=1" }, { text: " now" },
    ]);
  });
  it("links www. and bare domains with https", () => {
    expect(links("www.google.com and optima.honeymedia.uz/g/352035")).toEqual([
      ["www.google.com", "https://www.google.com"],
      ["optima.honeymedia.uz/g/352035", "https://optima.honeymedia.uz/g/352035"],
    ]);
  });
  it("drops trailing punctuation", () => {
    expect(links("Open https://kun.uz/news.")).toEqual([["https://kun.uz/news", "https://kun.uz/news"]]);
    expect(links("(https://kun.uz)")).toEqual([["https://kun.uz", "https://kun.uz"]]);
  });
  it("leaves e-mail addresses, plain words and unsafe schemes alone", () => {
    expect(links("mail me at ali@gmail.com")).toEqual([]);
    expect(links("salom dunyo 3.14 file.txt")).toEqual([]);
    expect(links("javascript:alert(1)")).toEqual([]);
  });
});

describe("linkify brackets", () => {
  it("keeps a bracket that belongs to the URL", () => {
    expect(linkify("https://en.wikipedia.org/wiki/Foo_(bar)").map((piece) => piece.href)).toEqual(["https://en.wikipedia.org/wiki/Foo_(bar)"]);
  });
});
