import { describe, it, expect } from "vitest";
import { inviteMessage, personalInviteUrl, shareLinks, internationalPhone } from "@/lib/couple/invite-share";

const event = { coupleNames: "Ана и Марко", eventDate: "2027-06-12", venueName: "Сала Лотос" };

describe("personalInviteUrl (A1)", () => {
  it("joins origin, slug and the guest's token", () => {
    expect(personalInviteUrl("https://kadesum.mk/", "abcDEF123", "tok_en-XXXXXXXXXXXXXXXXXX")).toBe(
      "https://kadesum.mk/invite/abcDEF123?g=tok_en-XXXXXXXXXXXXXXXXXX",
    );
  });
});

describe("inviteMessage (A9)", () => {
  it("greets the guest and names the couple, date, venue and personal link", () => {
    const text = inviteMessage({ guestName: "Петар Петровски", link: "https://x.mk/invite/s?g=t", ...event });
    expect(text).toBe(
      "Почитуван/а Петар Петровски,\n" +
        "со радост Ве покануваме на свадбата на Ана и Марко на 12.06.2027 во Сала Лотос.\n" +
        "Вашата покана и потврда за доаѓање: https://x.mk/invite/s?g=t",
    );
  });

  it("says 'celebration' for events that are not weddings", () => {
    expect(inviteMessage({ guestName: "А", link: "L", ...event, eventType: "birthday" })).toContain("на прославата на Ана и Марко");
  });
});

describe("internationalPhone", () => {
  it("turns Macedonian numbers into international digits", () => {
    expect(internationalPhone("070 123 456")).toBe("38970123456");
    expect(internationalPhone("+389 70 123-456")).toBe("38970123456");
    expect(internationalPhone("0038970123456")).toBe("38970123456");
    expect(internationalPhone("+49 151 2345678")).toBe("491512345678");
  });

  it("gives null for no number", () => {
    expect(internationalPhone(null)).toBeNull();
    expect(internationalPhone("  -  ")).toBeNull();
  });
});

describe("shareLinks (A9)", () => {
  it("builds WhatsApp, Viber and SMS links with the message", () => {
    const links = shareLinks("070 123 456", "Здраво & добредојде");
    expect(links.whatsapp).toBe("https://wa.me/38970123456?text=%D0%97%D0%B4%D1%80%D0%B0%D0%B2%D0%BE%20%26%20%D0%B4%D0%BE%D0%B1%D1%80%D0%B5%D0%B4%D0%BE%D1%98%D0%B4%D0%B5");
    expect(links.viber).toBe(`viber://forward?text=${encodeURIComponent("Здраво & добредојде")}`);
    expect(links.sms).toBe(`sms:+38970123456?body=${encodeURIComponent("Здраво & добредојде")}`);
  });

  it("lets WhatsApp and SMS pick the contact when there is no phone", () => {
    const links = shareLinks(null, "x");
    expect(links.whatsapp).toBe("https://wa.me/?text=x");
    expect(links.sms).toBe("sms:?body=x");
  });
});
