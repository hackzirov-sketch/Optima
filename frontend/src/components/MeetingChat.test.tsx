import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { MeetingChat } from "./MeetingChat";
vi.mock("../lib/i18n/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, locale: "en" }) }));
it("keeps closed chat out of the layout but exposes the chat button", () => {
  const html = renderToStaticMarkup(<MeetingChat messages={[]} connected={0} selfId="me" nameFor={id => id} open={false} onOpen={() => {}} onSend={() => 0} />);
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain('class="meeting-chat-panel"');
});
it("renders messages as text, without interpreting injected HTML", () => {
  const html = renderToStaticMarkup(<MeetingChat messages={[{ id: "1", text: "<script>alert(1)</script>", senderId: "peer", time: 1 }]} connected={1} selfId="me" nameFor={id => id} open onOpen={() => {}} onSend={() => 1} />);
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).toContain("meetingRoom.chatSessionHint");
});
