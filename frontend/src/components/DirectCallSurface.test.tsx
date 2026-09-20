import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DirectCallSurface } from "./DirectCallSurface";

vi.mock("../lib/i18n/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

function render(video: boolean, ready = true) {
  return renderToStaticMarkup(<DirectCallSurface name="Test Person" video={video} status="Connecting" ready={ready}
    microphone={false} camera={video} screenSharing={false} securityCode={null}
    remote={<span>Remote media</span>} local={<span>Self media</span>}
    onMic={() => {}} onCamera={() => {}} onScreen={() => {}} onLeave={() => {}} />);
}

describe("DirectCallSurface", () => {
  it("keeps audio calls separate from meeting tools", () => {
    const html = render(false);
    expect(html).toContain("is-audio");
    expect(html).toContain("Remote media");
    expect(html).not.toContain("Self media");
    expect(html).not.toContain("meeting-controls");
    expect(html).not.toContain("participantsTab");
    expect(html).not.toContain("meeting.code");
  });
  it("shows a self preview in video calls", () => {
    const html = render(true);
    expect(html).toContain("is-video");
    expect(html).toContain("direct-surface-self");
    expect(html).toContain("Self media");
  });
  it("disables media actions while connecting but keeps hangup available", () => {
    const html = render(false, false);
    expect(html.match(/disabled=""/g)).toHaveLength(3);
    expect(html).toContain('class="direct-surface-end"');
    expect(html).toContain('role="status"');
  });
});
