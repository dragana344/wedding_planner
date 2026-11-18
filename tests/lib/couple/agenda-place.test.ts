import { describe, it, expect } from "vitest";
import { NO_PLACE, placeMode, venuePlace } from "@/lib/couple/agenda-place";
import { placesOf } from "@/lib/couple/invitation-program";

const venue = { name: "Ресторан Панорама", address: "Водно бб, Скопје", rooms: ["Голема сала"] };

describe("venuePlace (0156)", () => {
  it("names the restaurant and its hall, and links the map to the address", () => {
    expect(venuePlace(venue)).toEqual({
      location: "Ресторан Панорама – Голема сала",
      address: "Водно бб, Скопје",
      mapUrl: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("Ресторан Панорама, Водно бб, Скопје"),
    });
  });

  it("lists several halls and copes with a venue that has no address", () => {
    const place = venuePlace({ name: "Сала Лотос", address: null, rooms: ["А", "Б"] });
    expect(place.location).toBe("Сала Лотос – А, Б");
    expect(place.address).toBe("");
    expect(place.mapUrl).toBe("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("Сала Лотос"));
  });

  it("uses just the name when no hall is booked", () => {
    expect(venuePlace({ name: "Сала Лотос", address: "Улица 1", rooms: [] }).location).toBe("Сала Лотос");
  });
});

describe("a room's own address (0157)", () => {
  it("wins over the venue's address, and a web map link wins over the generated one", () => {
    const place = venuePlace({ ...venue, roomAddress: "Друга зграда 5", roomMapUrl: "https://maps.example/hall" });
    expect(place.address).toBe("Друга зграда 5");
    expect(place.mapUrl).toBe("https://maps.example/hall");
  });
  it("falls back to the venue's address when the room has none, and ignores a map link that isn't http(s)", () => {
    const place = venuePlace({ ...venue, roomAddress: " ", roomMapUrl: "javascript:alert(1)" });
    expect(place.address).toBe("Водно бб, Скопје");
    expect(place.mapUrl).toBe("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("Ресторан Панорама, Водно бб, Скопје"));
  });
  it("searches by the room's address when it has one but no map link", () => {
    expect(venuePlace({ ...venue, roomAddress: "Друга зграда 5" }).mapUrl).toBe(
      "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("Ресторан Панорама, Друга зграда 5"),
    );
  });
});

describe("placeMode", () => {
  it("tells nothing, the restaurant and another place apart", () => {
    expect(placeMode(NO_PLACE, venue)).toBe("none");
    expect(placeMode(venuePlace(venue), venue)).toBe("venue");
    expect(placeMode({ location: "ресторан панорама – друга сала", address: "", mapUrl: "" }, venue)).toBe("venue");
    expect(placeMode({ location: "Црква", address: "Охрид", mapUrl: "" }, venue)).toBe("custom");
    expect(placeMode({ location: "", address: "Охрид", mapUrl: "" }, venue)).toBe("custom");
  });
});

describe("placesOf (the invitation's Локации list)", () => {
  it("lists each distinct place with an address or map link once, in agenda order", () => {
    expect(
      placesOf([
        { location: "Црква", address: "Охрид 1", map_url: null },
        { location: "Ресторан", address: "Водно", map_url: "https://maps.example/r" },
        { location: " црква ", address: "охрид 1", map_url: null },
        { location: "Само име", address: null, map_url: null },
        { location: null, address: null, map_url: null },
        { location: null, address: "Улица 5", map_url: " " },
      ]),
    ).toEqual([
      { label: "Црква", address: "Охрид 1", map_url: null },
      { label: "Ресторан", address: "Водно", map_url: "https://maps.example/r" },
      { label: "Улица 5", address: "Улица 5", map_url: null },
    ]);
  });
});
