import { crc32, deflateSync } from "zlib";
import type { KeepsakeData } from "@/lib/couple/keepsake/types";

// A filled-in wedding for the keepsake builders' tests (group A task 7).

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

/** A small valid RGB PNG: a soft gold-to-ivory gradient. */
export function gradientPng(width = 60, height = 80): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const rows: number[] = [];
  for (let y = 0; y < height; y++) {
    rows.push(0);
    const t = y / height;
    for (let x = 0; x < width; x++) rows.push(Math.round(201 + 50 * t), Math.round(162 + 85 * t), Math.round(74 + 164 * t));
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.from(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function keepsakeFixture(overrides: Partial<KeepsakeData> = {}): KeepsakeData {
  return {
    isWedding: true,
    coupleNames: "Ана & Марко",
    eventDate: "2027-06-12",
    startTime: "18:00:00",
    endTime: "02:00:00",
    venueName: "Ресторан Езеро",
    roomNames: ["Голема сала"],
    invitation: {
      templateId: "elegant-gold",
      message: "Со радост Ве покануваме да го споделите со нас најубавиот ден од нашите животи.\nВе очекуваме!",
      photo: { data: gradientPng(), format: "png" },
    },
    agenda: [
      { time: "16:00", title: "Венчавка во црквата Св. Климент", location: "Охрид", notes: null },
      { time: "18:00", title: "Пречек на гостите", location: "Ресторан Езеро", notes: "Шампањ на тераса" },
      { time: "21:00", title: "Сечење на тортата", location: null, notes: null },
    ],
    locations: [
      { label: "Црква Св. Климент", address: "Плаошник, Охрид", mapUrl: "https://maps.google.com/?q=Plaoshnik" },
      { label: "Ресторан Езеро", address: "Кеј Македонија 5, Охрид", mapUrl: null },
    ],
    guests: [
      { fullName: "Ана Петрова", side: "bride", status: "confirmed", partySize: 2, childrenCount: 0, menuText: "Месо ×2", allergies: null, comment: "Едвај чекаме!" },
      { fullName: "Борис Стојанов", side: "groom", status: "confirmed", partySize: 4, childrenCount: 2, menuText: "Месо ×2, Вегетаријанско ×2", allergies: "ореви", comment: null },
      { fullName: "Весна Трајкова", side: "bride", status: "declined", partySize: 1, childrenCount: 0, menuText: "", allergies: null, comment: null },
    ],
    menus: [
      { name: "Месо", count: 4, dishes: [{ course: "starter", name: "Овчарска салата" }, { course: "main", name: "Јагнешко печено" }, { course: "dessert", name: "Свадбена торта" }] },
      { name: "Вегетаријанско", count: 2, dishes: [{ course: "main", name: "Полнети пиперки" }] },
    ],
    attending: { people: 6, children: 2, parties: 2 },
    numbersSentAt: "2027-06-01T10:00:00Z",
    tables: [
      { room: "Голема сала", title: "Маса 1", capacity: 8, seats: [{ number: 1, name: "Ана Петрова" }, { number: 2, name: "Ана Петрова" }] },
      { room: "Голема сала", title: "Кумовска маса", capacity: 6, seats: [{ number: 1, name: "Борис Стојанов" }, { number: 2, name: "Чичко Јован" }] },
    ],
    greetings: [
      { name: "Ана Петрова", message: "Ви посакуваме љубов, среќа и многу насмевки!", hasVideo: true, createdAt: "2027-06-12T20:15:00Z" },
      { name: "Борис Стојанов", message: "Честито, драги наши!", hasVideo: false, createdAt: "2027-06-12T21:00:00Z" },
    ],
    budget: {
      venue: { estimated: 300000, paid: 50000 },
      items: [
        { category: "Фотографија", name: "Фотограф Марија", estimated: 40000, paid: 20000, paidBy: "Ана", paymentDate: "2027-03-01", notes: "Капаро" },
        { category: "Цвеќиња и декор", name: "Букет", estimated: null, paid: 3000, paidBy: null, paymentDate: null, notes: null },
      ],
      totalEstimated: 340000,
      totalPaid: 73000,
    },
    checklist: [
      { title: "Резервирај фотограф", dueDate: "2027-02-01", done: true, subtasks: [{ title: "Спореди три понуди", done: true }] },
      { title: "Нарачај торта", dueDate: null, done: false, subtasks: [] },
    ],
    notes: [{ title: "Песни за првиот танц", content: "Perfect — Ed Sheeran\nили „Ти си мојата љубов“", updatedAt: "2027-05-20T09:00:00Z" }],
    ...overrides,
  };
}

/** An event with nothing filled in beyond what the venue entered. */
export function emptyKeepsake(): KeepsakeData {
  return keepsakeFixture({
    invitation: null,
    agenda: [],
    locations: [],
    guests: [],
    menus: [],
    attending: { people: 0, children: 0, parties: 0 },
    numbersSentAt: null,
    tables: [],
    greetings: [],
    budget: { venue: { estimated: null, paid: null }, items: [], totalEstimated: 0, totalPaid: 0 },
    checklist: [],
    notes: [],
  });
}
