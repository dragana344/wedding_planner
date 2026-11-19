// Privacy policy (COMP-001), Macedonian and English. Written from
// docs/production/DATA-MAP.md, RETENTION.md, COOKIES.md, HOSTING.md and
// BACKUPS.md. Do not add a processor, data category or period here that the
// system does not have; tests/lib/pure/legal-parity.test.ts keeps the facts
// in step. Review record: docs/production/LEGAL-REVIEW.md (v1.1 resolves
// review 1; v1.3 lists what changed since; the role allocation is still to be
// confirmed by legal review).

import { LEGAL_LAST_UPDATED, LEGAL_VERSION, PLACEHOLDERS as P, RETENTION_FACTS as R, SECURITY_FACTS as S } from "./facts";
import { localize, type Bi, type BiDocument, type Lang, type LegalDocument } from "./types";

const bi = (mk: string, en: string): Bi => ({ mk, en });

const privacyDocument: BiDocument = {
  title: bi("Политика за приватност", "Privacy Policy"),
  description: bi(
    "Како платформата Каде си? ги обработува личните податоци на локалите, нивните клиенти и гостите.",
    "How the Каде си? platform processes the personal data of venues, their clients and guests.",
  ),
  intro: [
    bi(
      "Каде си? е платформа за угостителски објекти (ресторани, сали) за управување со настани, резервации, распоред на маси и менија. Клиентите на локалот (младенци и други организатори на настани) добиваат своја контролна табла, а нивните гости добиваат дигитална покана.",
      "Каде си? is a platform for hospitality venues (restaurants, halls) to manage events, reservations, table layouts and menus. The venue's clients (couples and other event organizers) get their own dashboard, and their guests get a digital invitation.",
    ),
    bi(
      "Оваа политика објаснува кои лични податоци се обработуваат, зошто, кој ги гледа, колку долго се чуваат и кои права ги имате. Се применуваат Законот за заштита на личните податоци (Службен весник на Република Северна Македонија бр. 42/2020) и, каде што е применлива, Општата регулатива за заштита на податоците (ЕУ) 2016/679 (GDPR).",
      "This policy explains which personal data is processed, why, who sees it, how long it is kept and what rights you have. It is governed by the Law on Personal Data Protection (Official Gazette of the Republic of North Macedonia No. 42/2020) and, where applicable, the General Data Protection Regulation (EU) 2016/679 (GDPR).",
    ),
    bi(
      `Овој документ е објавен на македонски и англиски јазик. Во случај на разлика, преовладува македонската верзија.`,
      `This document is published in Macedonian and English. In case of a difference, the Macedonian version prevails.`,
    ),
  ],
  sections: [
    {
      id: "who-we-are",
      heading: bi("Кои сме ние", "Who we are"),
      blocks: [
        {
          type: "p",
          text: bi(
            `Платформата ја управува ${P.company} („ние“). Правното лице за платформата е во основање; неговиот назив, седиште и ЕМБС ќе бидат објавени тука штом биде запишано. Дотогаш контакт е ${P.supportEmail}. Веб-страница: ${P.domain}.`,
            `The platform is operated by ${P.company} ("we"). The legal entity for the platform is being incorporated; its name, registered seat and registration number will be published here once it is registered. Until then the contact is ${P.supportEmail}. Website: ${P.domain}.`,
          ),
        },
        {
          type: "p",
          text: bi(
            `За прашања за приватноста пишете на ${P.privacyEmail}.`,
            `For privacy questions write to ${P.privacyEmail}.`,
          ),
        },
      ],
    },
    {
      id: "roles",
      heading: bi("Кој е одговорен за вашите податоци", "Who is responsible for your data"),
      blocks: [
        {
          type: "p",
          text: bi(
            "Платформата ја користат три групи луѓе: вработени во локалот (со сопствена сметка), клиенти на локалот, односно младенци или организатори (со корисничко име и лозинка што ги издава локалот) и гости (со линк од поканата, без сметка).",
            "Three groups of people use the platform: venue staff (with their own account), the venue's clients, i.e. couples or organizers (with a username and password issued by the venue), and guests (with an invitation link, no account).",
          ),
        },
        {
          type: "ul",
          items: [
            bi(
              "Локалот е контролор за податоците на своите клиенти, нивните гости и своите резервации. Локалот им ги нуди на своите клиенти алатките за планирање (листа на гости, покана, белешки, буџет) како дел од својата услуга, а клиентот ги пополнува. Вработените во локалот не ги гледаат листата на гости ниту белешките и другата содржина за планирање на клиентот во својот панел, но локалот може да ги извезе или избрише.",
              "The venue is the controller of the data of its clients, their guests and its reservations. The venue makes the planning tools (guest list, invitation, notes, budget) available to its clients as part of its service, and the client fills them in. The venue's staff do not see the guest list or the client's notes and other planning content in their panel, but the venue can export or erase them.",
            ),
            bi(
              "Клиентот ја води листата на гости за својот настан како лична активност и е одговорен за тоа што внесува за другите луѓе.",
              "The client keeps the guest list for its own event as a personal activity and is responsible for what it enters about other people.",
            ),
            bi(
              "Ние ги обработуваме податоците од првата точка само во име на локалот и по негови упатства, како обработувач, според Договорот за обработка на лични податоци со локалот.",
              "We process the data in the first point only on the venue's behalf and on its instructions, as a processor, under the Data Processing Agreement with the venue.",
            ),
            bi(
              "Ние сме контролор за податоците за сметките на вработените во локалите, за пораките испратени преку формуларот за контакт и барањата за демо, за барањата за поддршка што ги испраќа локалот и за безбедносните записи (технички дневници, бројачи за ограничување на барањата и ревизорски дневник).",
              "We are the controller of the data about venue staff accounts, messages sent through the contact form and demo requests, support requests the venue sends, and security records (technical logs, rate-limit counters and the audit log).",
            ),
          ],
        },
        {
          type: "p",
          text: bi(
            "Ако сте клиент или гостин на локал, за вашите податоци најпрво обратете се до локалот. Ако ни пишете нам, ќе го проследиме барањето до локалот и ќе му помогнеме да одговори.",
            "If you are a client or guest of a venue, contact the venue first about your data. If you write to us, we forward the request to the venue and help it respond.",
          ),
        },
      ],
    },
    {
      id: "data",
      heading: bi("Кои податоци ги обработуваме", "What data we process"),
      blocks: [
        {
          type: "table",
          head: [bi("Чии податоци", "Whose data"), bi("Податоци", "Data"), bi("Извор", "Source")],
          rows: [
            [
              bi("Вработени во локалот", "Venue staff"),
              bi(
                "Е-пошта, лозинка (зачувана само како хаш), време на отворање на сметката и последна најава, сесии за најава, IP-адреса и прелистувач во безбедносните записи на најавите, име и телефон на локалот, имиња на сопственикот и менаџерите и нивните лозинки (само хаш), верзија и време на прифаќање на Условите за користење.",
                "Email, password (stored only as a hash), account creation and last sign-in time, sign-in sessions, IP address and browser in the sign-in security records, venue name and phone, names of the owner and managers and their passwords (hash only), version and time of acceptance of the Terms of Service.",
              ),
              bi(
                "Локалот, кога нашиот тим ја отвора сметката, и самите вие при користење. Е-поштата е задолжителна за да се отвори сметка.",
                "The venue, when our team opens the account, and you when using the service. The email is required to open an account.",
              ),
            ],
            [
              bi("Клиенти на локалот (младенци, организатори)", "Venue clients (couples, organizers)"),
              bi(
                "Имиња, датум, време и вид на настанот, е-пошта и телефон за контакт, вкупна цена и платен депозит (евиденција што ја води локалот; платформата не обработува плаќања), корисничко име и лозинка (зачувана само како хаш), сесија за најава, содржина што ја внесувате за планирање (белешки, агенда, локации кои може да вклучуваат приватна адреса, буџет, листа на задачи), текст и фотографија на поканата, ознаки на маси, барања за поддршка до нашиот тим и пораките во нив.",
                "Names, date, time and type of the event, contact email and phone, total price and deposit paid (a record kept by the venue; the platform processes no payments), username and password (stored only as a hash), sign-in session, content you enter for planning (notes, agenda, locations that may include a private address, budget, to-do list), invitation text and photo, table labels, support requests to our team and the messages in them.",
              ),
              bi("Локалот и самите вие.", "The venue and you."),
            ],
            [
              bi("Гости", "Guests"),
              bi(
                "Име и презиме, телефон (по избор, и на заедничкиот формулар за одговор, за полесно препознавање), број на лица и за колку лица е поканет, имиња на лицата што доаѓаат со гостинот (по избор), одговор на поканата (деца, мени, алергии, коментар), страна (невестина или младоженецова), белешки и историјата на одговорите: секој одговор посебно, со време, извор и состојбата пред и по него.",
                "Full name, phone (optional, also on the shared answer form, to help recognise the guest), party size and how many people the guest is invited for, names of the people coming with the guest (optional), invitation answer (children, menu, allergies, comment), side (bride's or groom's), notes, and the history of answers: every answer separately, with its time, source and the state before and after it.",
              ),
              bi("Младенците или организаторот, или самиот гостин преку линкот од поканата.", "The couple or organizer, or the guest through the invitation link."),
            ],
            [
              bi("Гости што испраќаат честитка или споделуваат фотографии", "Guests who send a greeting or share photos"),
              bi(
                "Честитка: име и презиме, текст и, по избор, видео. Албум: фотографии и видеа од настанот (на нив може да се препознаат луѓе), име на испраќачот (по избор) и време на согласноста за прикажување во албумот.",
                "Greeting: full name, text and, optionally, a video. Album: photos and videos of the event (people may be recognisable in them), the sender's name (optional) and the time of consent to showing them in the album.",
              ),
              bi(
                "Самиот гостин, преку поканата (честитка) или преку линкот или QR-кодот на албумот.",
                "The guest, through the invitation (greeting) or through the album's link or QR code.",
              ),
            ],
            [
              bi("Гости со резервација", "Reservation customers"),
              bi(
                "Име, телефон, е-пошта (по избор), датум и време, број на лица, вид на настан, белешка.",
                "Name, phone, email (optional), date and time, party size, event type, note.",
              ),
              bi("Локалот.", "The venue."),
            ],
            [
              bi("Луѓе на фотографии од настани", "People in event photos"),
              bi(
                "Фотографии од поминати настани што локалот ги прикачува за своето портфолио; на нив може да се препознаат луѓе.",
                "Photos of past events that the venue uploads for its portfolio; people may be recognisable in them.",
              ),
              bi("Локалот.", "The venue."),
            ],
            [
              bi("Вработени во локалот што бараат поддршка", "Venue staff asking for support"),
              bi(
                "Име, наслов и опис на проблемот, пораките со нашиот тим, статус и време.",
                "Name, subject and description of the problem, the messages with our team, status and time.",
              ),
              bi("Самите вие, преку панелот на локалот.", "You, through the venue panel."),
            ],
            [
              bi("Испраќачи на формуларот за контакт или барање за демо", "Contact-form and demo-request senders"),
              bi(
                "Име, е-пошта, порака и време на испраќање; кај барањето за демо и име на локалот, град и телефон.",
                "Name, email, message and time sent; for a demo request also the venue name, city and phone.",
              ),
              bi("Самите вие.", "You."),
            ],
            [
              bi("Сите посетители", "All visitors"),
              bi(
                "Технички записи кај давателот на хостинг (IP-адреса, адреса на страницата, прелистувач), бројачи за ограничување на барањата кои содржат само хаш од IP-адресата, извештаи за грешки кои се поставени да не содржат лични податоци.",
                "Technical records at the hosting provider (IP address, page address, browser), rate-limit counters that contain only a hash of the IP address, error reports configured to exclude personal data.",
              ),
              bi("Автоматски, при користење на платформата.", "Automatically, when you use the platform."),
            ],
          ],
        },
        {
          type: "p",
          text: bi(
            "Ревизорскиот дневник на безбедносно важните дејства (на пример промена на одговор преку линк, извоз или бришење на податоци) содржи внатрешни идентификатори, вид на дејството, време, а за одговорите преку линк и претходниот и новиот одговор и скратен еднонасочен хаш од IP-адресата. Кога дејството го прави менаџер на локалот, се запишува и неговото име. Не содржи имиња ни податоци за контакт на клиентите, гостите и гостите со резервација.",
            "The audit log of security-relevant actions (for example an answer changed through a link, a data export or erasure) contains internal identifiers, the type of action, the time and, for answers through a link, the previous and new answer and a shortened one-way hash of the IP address. When a venue manager performs the action, the manager's name is recorded too. It contains no names or contact details of clients, guests or reservation customers.",
          ),
        },
      ],
    },
    {
      id: "sensitive",
      heading: bi("Белешки и чувствителни податоци", "Notes and sensitive data"),
      blocks: [
        {
          type: "p",
          text: bi(
            "Полињата за белешки (кај гостите, резервациите и белешките за планирање) се слободен текст. Во нив може да се внесат потреби за исхрана, алергии или потреби за пристап, кои може да откријат податоци за здравјето или верските убедувања (посебни категории на лични податоци). Внесувајте ги само ако се потребни за настанот и ако лицето дало изречна согласност (на пример, гостинот ви кажал писмено и се согласил тоа да се запише). Претпочитајте неутрална белешка, како „вегетаријанско мени“, наместо дијагноза. Ние не ги користиме овие податоци за ниедна друга цел.",
            "The notes fields (on guests, reservations and planning notes) are free text. Dietary needs, allergies or access needs may be entered there, which can reveal health data or religious beliefs (special categories of personal data). Enter them only if they are needed for the event and the person has given explicit consent (for example, the guest told you in writing and agreed that it is recorded). Prefer a neutral note such as \"vegetarian menu\" over a diagnosis. We do not use this data for any other purpose.",
          ),
        },
      ],
    },
    {
      id: "purposes",
      heading: bi("Цели и правен основ", "Purposes and legal basis"),
      blocks: [
        {
          type: "table",
          head: [bi("Цел", "Purpose"), bi("Правен основ", "Legal basis")],
          rows: [
            [
              bi("Сметка на локалот и давање на услугата", "Venue account and providing the service"),
              bi("Извршување на договорот со локалот (член 6(1)(б) GDPR).", "Performance of the contract with the venue (Art. 6(1)(b) GDPR)."),
            ],
            [
              bi("Податоци на клиентите на локалот", "Data of the venue's clients"),
              bi(
                "Договорот меѓу локалот и клиентот (член 6(1)(б)). Го потврдува локалот како контролор; ние ги обработуваме како обработувач.",
                "The contract between the venue and the client (Art. 6(1)(b)). Confirmed by the venue as controller; we process the data as a processor.",
              ),
            ],
            [
              bi("Податоци на гостите и на лицата наведени во содржината за планирање", "Data of guests and of people named in planning content"),
              bi(
                "Легитимен интерес на локалот и клиентот да го организираат настанот и распоредот на гостите (член 6(1)(ѓ)). Го потврдува локалот како контролор.",
                "Legitimate interest of the venue and the client in organising the event and seating the guests (Art. 6(1)(f)). Confirmed by the venue as controller.",
              ),
            ],
            [
              bi("Белешки за здравјето или исхраната", "Health or diet notes"),
              bi("Изречна согласност на лицето (член 9(2)(а)).", "Explicit consent of the person (Art. 9(2)(a))."),
            ],
            [
              bi("Резервации кај локалот", "Reservations at the venue"),
              bi(
                "Договорот или чекорите пред договорот меѓу локалот и гостинот со резервација (член 6(1)(б)).",
                "The contract, or steps before a contract, between the venue and the reservation customer (Art. 6(1)(b)).",
              ),
            ],
            [
              bi("Фотографии во портфолиото на локалот", "Photos in the venue's portfolio"),
              bi(
                "Согласност на прикажаните лица или легитимен интерес на локалот; одлучува локалот како контролор.",
                "Consent of the people shown or the venue's legitimate interest; decided by the venue as controller.",
              ),
            ],
            [
              bi("Албум со фотографии и видеа од гостите", "Album of the guests' photos and videos"),
              bi(
                "Согласност на гостинот што ги прикачува (член 6(1)(а)), дадена со полето за согласност пред прикачувањето; за другите лица на фотографиите, легитимен интерес на клиентот и локалот да ги зачуваат спомените од настанот (член 6(1)(ѓ)). Го потврдува локалот како контролор.",
                "Consent of the guest who uploads them (Art. 6(1)(a)), given with the consent box before uploading; for other people in the photos, the legitimate interest of the client and the venue in keeping memories of the event (Art. 6(1)(f)). Confirmed by the venue as controller.",
              ),
            ],
            [
              bi("Честитки од гостите (текст и видео)", "Greetings from guests (text and video)"),
              bi(
                "Согласност на гостинот што ја испраќа (член 6(1)(а)). Ја потврдува локалот како контролор.",
                "Consent of the guest who sends it (Art. 6(1)(a)). Confirmed by the venue as controller.",
              ),
            ],
            [
              bi("Барања за поддршка", "Support requests"),
              bi(
                "Од локалот: извршување на договорот со локалот (член 6(1)(б)). Од клиентот: дел од услугата што локалот му ја дава на клиентот; ги обработуваме како обработувач, а вработените во локалот не ги гледаат.",
                "From the venue: performance of the contract with the venue (Art. 6(1)(b)). From a client: part of the service the venue provides to the client; we process them as a processor, and the venue's staff do not see them.",
              ),
            ],
            [
              bi("Одговор на пораки од формуларот за контакт и на барања за демо", "Answering contact-form messages and demo requests"),
              bi(
                "Преземање чекори на ваше барање пред склучување договор или наш легитимен интерес да одговориме на прашањата.",
                "Taking steps at your request before entering into a contract, or our legitimate interest in answering enquiries.",
              ),
            ],
            [
              bi(
                "Безбедност: ограничување на барањата, ревизорски дневник, записи за најавите, извештаи за грешки",
                "Security: rate limiting, audit log, sign-in records, error reports",
              ),
              bi("Легитимен интерес за безбедна и достапна услуга.", "Legitimate interest in a secure and available service."),
            ],
            [
              bi("Резервни копии", "Backups"),
              bi(
                "Легитимен интерес и обврската за безбедност на обработката, за да се вратат податоците по инцидент.",
                "Legitimate interest and the duty to keep processing secure, so data can be restored after an incident.",
              ),
            ],
          ],
        },
        {
          type: "p",
          text: bi(
            "Не продаваме лични податоци, не ги користиме за рекламирање и не донесуваме автоматизирани одлуки со правни последици за вас.",
            "We do not sell personal data, do not use it for advertising and make no automated decisions with legal effects on you.",
          ),
        },
      ],
    },
    {
      id: "invitations",
      heading: bi("Покани и одговори преку линк", "Invitations and answers through a link"),
      blocks: [
        {
          type: "ul",
          items: [
            bi(
              "Секој што го има линкот од поканата може да ја отвори страницата и да ги види имињата на младенците, датумот и почетокот на настанот, локалот и салата, текстот и фотографијата на поканата. Листата на гости не е видлива преку поканата.",
              "Anyone who has the invitation link can open the page and see the couple's names, the date and start time of the event, the venue and hall, and the invitation text and photo. The guest list is not visible through the invitation.",
            ),
            bi(
              "Секој што го има линкот може да одговори на поканата. Секоја промена на одговорот преку линкот се запишува и младенците ги гледаат времето на промената и претходниот одговор.",
              "Anyone who has the link can answer the invitation. Every change of an answer through the link is recorded, and the couple sees the time of the change and the previous answer.",
            ),
            bi(
              "Фотографијата на поканата и фотографиите од настани во портфолиото на локалот се достапни за секој што ја има директната адреса на датотеката. Пред прикачување отстранете ги податоците за локација од фотографијата, бидејќи датотеката се чува онаква каква што е прикачена.",
              "The invitation photo and the event photos in the venue's portfolio can be opened by anyone who has the file's direct address. Remove location data from a photo before uploading, because the file is stored as uploaded.",
            ),
            bi(
              "Кога личните податоци на настанот ќе се избришат, поканата и нејзината фотографија се бришат и линкот престанува да работи.",
              "When an event's personal data is erased, the invitation and its photo are deleted and the link stops working.",
            ),
          ],
        },
      ],
    },
    {
      id: "album",
      heading: bi("Албум и честитки од гостите", "Guests' album and greetings"),
      blocks: [
        {
          type: "ul",
          items: [
            bi(
              "Гостите можат преку линкот или QR-кодот на албумот да прикачат фотографии и видеа од настанот. Името не е задолжително. Пред прикачување гостинот мора да се согласи датотеките да бидат прикажани во албумот.",
              "Guests can upload photos and videos of the event through the album's link or QR code. The name is optional. Before uploading, the guest must agree that the files are shown in the album.",
            ),
            bi(
              "Гостите можат преку поканата да испратат честитка: име и презиме, текст и, по избор, видео.",
              "Guests can send a greeting through the invitation: full name, text and, optionally, a video.",
            ),
            bi(
              "Албумот и честитките ги гледаат само младенците или организаторот во својата контролна табла; тие можат да ги сокријат, избришат или преземат. Гостите не ги гледаат туѓите фотографии. Вработените во локалот не ги гледаат во својот панел, но локалот може да ги извезе или избрише. Датотеките се чуваат во приватно складиште и се отвораат само преку платформата.",
              "The album and greetings are seen only by the couple or organizer in their dashboard; they can hide, delete or download them. Guests do not see other people's photos. The venue's staff do not see them in their panel, but the venue can export or erase them. The files are kept in private storage and open only through the platform.",
            ),
            bi(
              "Албумот и честитките се бришат заедно со другите лични податоци на настанот (види „Колку долго ги чуваме податоците“). Ако сакате да се отстрани ваша фотографија или честитка порано, обратете се до младенците или до локалот.",
              "The album and greetings are erased together with the event's other personal data (see \"How long we keep data\"). If you want a photo or greeting of yours removed earlier, contact the couple or the venue.",
            ),
          ],
        },
      ],
    },
    {
      id: "client-access",
      heading: bi("Пристап на клиентите по настанот", "Client access after the event"),
      blocks: [
        {
          type: "ul",
          items: [
            bi(
              "До денот на настанот (вклучително) клиентот има целосен пристап до својата контролна табла. По настанот пристапот е само за преглед и преземање: нови внесувања и измени не се можни.",
              "Until the day of the event (inclusive) the client has full access to its dashboard. After the event the access is for viewing and downloading only: no new entries or changes are possible.",
            ),
            bi(
              `${R.guestDataMonthsAfterEvent} месеци по датумот на настанот пристапот завршува и личните податоци на настанот се бришат автоматски, со дневна задача. Ако настанот е откажан, пристапот завршува ${R.cancelledEventAccessDays} дена по откажувањето (или порано, ако тогаш завршува редовниот рок), а податоците потоа се бришат на ист начин.`,
              `${R.guestDataMonthsAfterEvent} months after the event date the access ends and the event's personal data is erased automatically, by a daily job. If the event is cancelled, the access ends ${R.cancelledEventAccessDays} days after the cancellation (or earlier, if the normal period ends then), and the data is then erased the same way.`,
            ),
            bi(
              "Рокот може да го продолжи само нашиот тим, на барање на локалот или на клиентот. Секое продолжување се запишува.",
              "Only our team can extend the period, at the request of the venue or the client. Every extension is recorded.",
            ),
            bi(
              "Додека трае пристапот, клиентот може во својата контролна табла да преземе целосна копија од податоците за својот настан („Преземи сè“), вклучително албумот и честитките.",
              "While the access lasts, the client can download a full copy of its event's data in the dashboard (\"Преземи сè\", \"Download everything\"), including the album and the greetings.",
            ),
            bi(
              "Се бришат: гостите (со белешките и алергиите), честитките, албумот, поканата, буџетот, листата на задачи, белешките, агендата, локациите, имињата во распоредот на маси, барањата за поддршка на клиентот и податоците за најава.",
              "Erased: the guests (with notes and allergies), greetings, album, invitation, budget, to-do list, notes, agenda, locations, the names in the seating plan, the client's support requests and the sign-in data.",
            ),
            bi(
              "Локалот го задржува својот деловен запис за настанот: датум и време, сала, вид на настан, имиња и контакт (е-пошта, телефон) на организаторот, број на гости, менија и нивниот број, својата цена, депозит и плаќања, и масите. Ако бришењето е по барање (не автоматско), се бришат и имињата и контактот на организаторот.",
              "The venue keeps its business record of the event: date and time, hall, event type, the organizer's names and contact (email, phone), guest numbers, menus and their counts, its own price, deposit and payments, and the tables. If the erasure is on request (not automatic), the organizer's names and contact are erased too.",
            ),
          ],
        },
      ],
    },
    {
      id: "guests",
      heading: bi("Ако сте гостин", "If you are a guest"),
      blocks: [
        {
          type: "ul",
          items: [
            bi(
              "Младенците или организаторот може да внесле за вас: име и презиме, телефон, број на лица, за колку лица сте поканети, дали доаѓате, на чија страна сте и белешка (на пример за исхрана). Ако одговорите преку линкот, ги внесувате самите вие: име, дали доаѓате и број на лица, а по избор и телефон и имиња на лицата што доаѓаат со вас.",
              "The couple or organizer may have entered about you: full name, phone, party size, how many people you are invited for, whether you are coming, whose side you are on and a note (for example about diet). If you answer through the link, you enter them yourself: name, whether you are coming and party size, and optionally a phone and the names of the people coming with you.",
            ),
            bi(
              "Секој ваш одговор се чува посебно (кога, преку кој линк и што се променило), за младенците да ја видат историјата на одговорите. Одговорот што не може сигурно да се поврзе со гостин од листата чека младенците да го проверат.",
              "Each of your answers is kept separately (when, through which link and what changed), so the couple can see the history of answers. An answer that cannot be matched to a guest on the list with certainty waits for the couple to check it.",
            ),
            bi(
              `Ако одговорите преку заедничкиот линк, вашиот прелистувач го памети вашиот одговор ${R.rsvpRememberDays} дена (потпишан код во локалното складиште на прелистувачот, не колаче), за следната посета да го промени истиот одговор. Со „Не сте вие?“ кодот се брише.`,
              `If you answer through the shared link, your browser remembers your answer for ${R.rsvpRememberDays} days (a signed code in the browser's local storage, not a cookie), so a later visit changes the same answer. "Not you?" deletes the code.`,
            ),
            bi(
              "Вашите податоци ги гледаат младенците или организаторот. Локалот може да ги извезе или избрише. Другите гости не ги гледаат.",
              "Your data is seen by the couple or organizer. The venue can export or erase it. Other guests do not see it.",
            ),
            bi(
              `Податоците, вклучително честитките и фотографиите што сте ги испратиле, се бришат автоматски ${R.guestDataMonthsAfterEvent} месеци по настанот, или ${R.cancelledEventAccessDays} дена по откажување на настанот (види „Колку долго ги чуваме податоците“).`,
              `The data, including the greetings and photos you sent, is erased automatically ${R.guestDataMonthsAfterEvent} months after the event, or ${R.cancelledEventAccessDays} days after the event is cancelled (see "How long we keep data").`,
            ),
            bi(
              "За пристап, исправка или бришење обратете се до локалот чие име е на поканата, или до младенците. Можете да ни пишете и нам, а ние ќе го проследиме барањето до локалот.",
              "For access, correction or erasure contact the venue named on the invitation, or the couple. You can also write to us, and we forward the request to the venue.",
            ),
            bi(
              "Родител или организаторот може да одговори за децата.",
              "A parent or the organizer can answer for children.",
            ),
          ],
        },
      ],
    },
    {
      id: "processors",
      heading: bi("Кој друг ги обработува податоците", "Who else processes the data"),
      blocks: [
        {
          type: "p",
          text: bi(
            "Користиме следниве даватели на услуги (подобработувачи). Податоците се чуваат во Европската Унија; ноќната задача за резервни копии се извршува на серверите на GitHub (види табела).",
            "We use the following service providers (sub-processors). The data is stored in the European Union; the nightly backup job runs on GitHub's servers (see the table).",
          ),
        },
        {
          type: "table",
          head: [bi("Давател", "Provider"), bi("Услуга", "Service"), bi("Податоци", "Data"), bi("Локација", "Location"), bi("Статус", "Status")],
          rows: [
            [
              bi("Supabase", "Supabase"),
              bi("База на податоци, најава, складирање на фотографии, дневни резервни копии", "Database, sign-in, photo storage, daily backups"),
              bi("Сите податоци опишани во оваа политика", "All data described in this policy"),
              bi("ЕУ, Ирска", "EU, Ireland"),
              bi("Активен", "Active"),
            ],
            [
              bi("Vercel", "Vercel"),
              bi("Хостинг на апликацијата и серверските функции", "Hosting of the application and server functions"),
              bi("Сите податоци при пренос; записи за барањата (IP-адреса, адреса на страницата, прелистувач)", "All data in transit; request records (IP address, page address, browser)"),
              bi("ЕУ, Даблин (Ирска) за серверските функции", "EU, Dublin (Ireland) for server functions"),
              bi("Активен", "Active"),
            ],
            [
              bi("Resend", "Resend"),
              bi(
                "Испраќање е-пошта (линк за поставување или промена на лозинка, известувања од формуларот за контакт и барањата за демо)",
                "Sending email (link to set or reset a password, notifications of contact-form messages and demo requests)",
              ),
              bi("Е-пошта на примачот и содржина на пораката", "Recipient email and message content"),
              bi("ЕУ", "EU"),
              bi("Планиран", "Planned"),
            ],
            [
              bi("Sentry", "Sentry"),
              bi("Следење на грешки во апликацијата", "Application error monitoring"),
              bi(
                "Технички опис на грешката; поставено да не испраќа содржина на барања, колачиња, идентитет на корисникот ни линкови од покани",
                "Technical description of the error; configured not to send request content, cookies, user identity or invitation links",
              ),
              bi("ЕУ, Франкфурт (Германија)", "EU, Frankfurt (Germany)"),
              bi("Планиран, само ако е вклучен", "Planned, only if enabled"),
            ],
            [
              bi("Cloudflare R2", "Cloudflare R2"),
              bi("Резервни копии надвор од главната инфраструктура", "Off-site backups"),
              bi("Шифрирана копија од базата на податоци и фотографиите", "An encrypted copy of the database and the photos"),
              bi("ЕУ", "EU"),
              bi("Планиран", "Planned"),
            ],
            [
              bi("GitHub", "GitHub"),
              bi(
                "Извршување на ноќната задача за резервни копии (GitHub Actions)",
                "Running the nightly backup job (GitHub Actions)",
              ),
              bi(
                "Привремено, додека трае задачата: копија од базата на податоци и фотографиите пред шифрирање и прикачување во Cloudflare R2",
                "Temporarily, while the job runs: a copy of the database and the photos before it is encrypted and uploaded to Cloudflare R2",
              ),
              bi("Ја определува GitHub", "Determined by GitHub"),
              bi("Планиран", "Planned"),
            ],
          ],
        },
        {
          type: "p",
          text: bi(
            `Е-поштата за поставување и промена на лозинка ја испраќа Supabase. Известувањата за пораките од формуларот за контакт и барањата за демо стигнуваат и во е-поштенското сандаче на нашиот тим. Податоци можеме да дадеме и на надлежни органи кога тоа го бара закон.`,
            `Emails to set or reset a password are sent by Supabase. Notifications of contact-form messages and demo requests also arrive in our team's email inbox. We may also disclose data to competent authorities when the law requires it.`,
          ),
        },
      ],
    },
    {
      id: "transfers",
      heading: bi("Пренос надвор од Европската Унија", "Transfers outside the European Union"),
      blocks: [
        {
          type: "p",
          text: bi(
            "Серверите и складиштето се во ЕУ. Давателите се компании со седиште во САД. Ако нивниот персонал пристапи до податоците од земја надвор од ЕУ, или ако задачата за резервни копии се изврши надвор од ЕУ, преносот се заснова на заштитните мерки од нивните договори за обработка на податоци, како што се стандардните договорни клаузули. Барањата може да минуваат низ најблиската точка од глобалната мрежа на Vercel.",
            "The servers and storage are in the EU. The providers are companies headquartered in the United States. If their staff access data from a country outside the EU, or if the backup job runs outside the EU, the transfer relies on the safeguards in their data processing agreements, such as standard contractual clauses. Requests may pass through the nearest point of Vercel's global network.",
          ),
        },
      ],
    },
    {
      id: "retention",
      heading: bi("Колку долго ги чуваме податоците", "How long we keep data"),
      blocks: [
        {
          type: "table",
          head: [bi("Податоци", "Data"), bi("Рок", "Period")],
          rows: [
            [
              bi(
                "Лични податоци на клиентите и гостите за настанот, вклучително албумот и честитките",
                "Personal data of clients and guests of an event, including the album and greetings",
              ),
              bi(
                `Се бришат автоматски, со дневна задача, ${R.guestDataMonthsAfterEvent} месеци по датумот на настанот; за откажан настан ${R.cancelledEventAccessDays} дена по откажувањето, ако тоа е порано. Рокот може да го продолжи само нашиот тим, на барање. Локалот може да ги избрише и порано. Останува деловниот запис на локалот (датум и време, сала, вид на настан, имиња и контакт на организаторот, број на гости, менија и нивниот број, цена, депозит и плаќања, маси), додека постои сметката на локалот; види „Пристап на клиентите по настанот“.`,
                `Erased automatically, by a daily job, ${R.guestDataMonthsAfterEvent} months after the event date; for a cancelled event ${R.cancelledEventAccessDays} days after the cancellation, if that is earlier. Only our team can extend the period, on request. The venue can erase them earlier. The venue's business record remains (date and time, hall, event type, the organizer's names and contact, guest numbers, menus and their counts, price, deposit and payments, tables) for as long as the venue account exists; see "Client access after the event".`,
              ),
            ],
            [
              bi("Пораки од формуларот за контакт и барања за демо", "Contact-form messages and demo requests"),
              bi(
                `${R.contactMessagesMonths} месеци од приемот во нашиот систем; копиите во е-поштенското сандаче на тимот се бришат во истиот рок.`,
                `${R.contactMessagesMonths} months after receipt in our system; copies in our team's email inbox are deleted within the same period.`,
              ),
            ],
            [
              bi("Барања за поддршка", "Support requests"),
              bi(
                `Затворените барања се бришат ${R.supportTicketMonthsAfterClose} месеци по затворањето. Барањата на клиентот се бришат и порано, заедно со личните податоци на настанот.`,
                `Closed requests are deleted ${R.supportTicketMonthsAfterClose} months after they are closed. A client's requests are deleted earlier if the event's personal data is erased first.`,
              ),
            ],
            [
              bi("Резервации", "Reservations"),
              bi(
                "Додека локалот не ги избрише. Откажаната резервација останува запишана како откажана; локалот може во секое време трајно да избрише откажана или завршена резервација.",
                "Until the venue deletes them. A cancelled reservation stays recorded as cancelled; the venue can permanently delete a cancelled or completed reservation at any time.",
              ),
            ],
            [
              bi("Сметка на локалот и вработени", "Venue account and staff"),
              bi(
                `Додека локалот не ја избрише сметката во поставките (бришењето е веднаш и трајно). Кога ние ја затвораме сметката, бришењето го закажуваме ${R.exportWindowAfterEndDays} дена однапред: локалот го гледа датумот во панелот и може да ги преземе податоците, а ние може да го откажеме бришењето во тој рок.`,
                `Until the venue deletes its account in the settings (the deletion is immediate and permanent). When we close the account, we schedule the deletion ${R.exportWindowAfterEndDays} days ahead: the venue sees the date in its panel and can download its data, and we can cancel the deletion within that time.`,
              ),
            ],
            [
              bi("Сесии за најава на клиентите", "Client sign-in sessions"),
              bi(
                `Истекуваат ${R.coupleSessionDays} дена по последното користење, а потоа се бришат со дневна задача.`,
                `Expire ${R.coupleSessionDays} days after last use, then are deleted by a daily job.`,
              ),
            ],
            [
              bi("Код „запомни ме“ на гостинот во прелистувачот", "The guest's \"remember me\" code in the browser"),
              bi(
                `${R.rsvpRememberDays} дена; гостинот може да го избрише со „Не сте вие?“ или со бришење на податоците на прелистувачот.`,
                `${R.rsvpRememberDays} days; the guest can delete it with "Not you?" or by clearing the browser's data.`,
              ),
            ],
            [
              bi("Бројачи за ограничување на барањата (хаш од IP-адреса)", "Rate-limit counters (hash of the IP address)"),
              bi(`${R.rateLimitCounterDays} ден.`, `${R.rateLimitCounterDays} day.`),
            ],
            [
              bi("Фотографии чиј запис е избришан или заменет", "Photos whose record was deleted or replaced"),
              bi(`Се бришат во рок од ${R.deletedFileHours} часа.`, `Deleted within ${R.deletedFileHours} hours.`),
            ],
            [
              bi("Резервни копии", "Backups"),
              bi(
                `Дневните копии кај Supabase се чуваат ${R.databaseBackupDays} дена, а шифрираните копии во Cloudflare R2 (откако ќе се вклучат) ${R.offsiteBackupDays} дена. Избришаните податоци исчезнуваат од резервните копии најдоцна по ${R.offsiteBackupDays} дена. Ако некогаш вратиме резервна копија, повторно ги применуваме сите бришења направени по нејзиното создавање.`,
                `Daily copies at Supabase are kept for ${R.databaseBackupDays} days and encrypted copies in Cloudflare R2 (once enabled) for ${R.offsiteBackupDays} days. Erased data disappears from backups after ${R.offsiteBackupDays} days at the latest. If we ever restore a backup, we re-apply every erasure made since it was created.`,
              ),
            ],
            [
              bi(
                "Ревизорски дневник (без имиња и податоци за контакт на клиентите и гостите)",
                "Audit log (no names or contact details of clients or guests)",
              ),
              bi("Додека трае сметката на локалот; потребен е за безбедност и за решавање спорови", "For as long as the venue's account exists; needed for security and for resolving disputes"),
            ],
            [
              bi("Технички записи кај давателите на хостинг и е-пошта", "Technical records at the hosting and email providers"),
              bi("Според роковите на давателот на услугата", "According to the provider's own retention periods"),
            ],
          ],
        },
      ],
    },
    {
      id: "security",
      heading: bi("Безбедност", "Security"),
      blocks: [
        {
          type: "ul",
          items: [
            bi("Целиот сообраќај е шифриран (HTTPS).", "All traffic is encrypted (HTTPS)."),
            bi(
              "Податоците на секој локал се одделени од другите локали со правила за пристап во самата база на податоци.",
              "Each venue's data is separated from other venues by access rules in the database itself.",
            ),
            bi(
              `Лозинките се чуваат само како хаш и мора да имаат најмалку ${S.minPasswordLength} знаци. Сесиите на клиентите се чуваат само како хаш. По ${S.coupleLoginMaxAttempts} неуспешни обиди за најава, сметката на клиентот се заклучува на ${S.coupleLockoutMinutes} минути.`,
              `Passwords are stored only as a hash and must have at least ${S.minPasswordLength} characters. Client sessions are stored only as a hash. After ${S.coupleLoginMaxAttempts} failed sign-in attempts, a client account is locked for ${S.coupleLockoutMinutes} minutes.`,
            ),
            bi(
              "Бројот на барања кон јавните формулари и најавите е ограничен, а безбедносно важните дејства се запишуваат во ревизорски дневник.",
              "Requests to public forms and sign-ins are rate-limited, and security-relevant actions are written to an audit log.",
            ),
            bi(
              "Секојдневни резервни копии, шифрирани пред да се пренесат надвор од главната инфраструктура, и хостинг во ЕУ. Пристап до производствените податоци има само мал број овластени лица.",
              "Daily backups, encrypted before they leave the main infrastructure, and hosting in the EU. Only a small number of authorised people can access production data.",
            ),
          ],
        },
      ],
    },
    {
      id: "cookies",
      heading: bi("Колачиња", "Cookies"),
      blocks: [
        {
          type: "p",
          text: bi(
            "Користиме само колачиња што се неопходни за најава и за работата на платформата, и еден запис во локалното складиште на прелистувачот на гостинот, за поканата да го памети неговиот одговор. Немаме колачиња за аналитика, рекламирање или од трети страни. Затоа не бараме согласност за колачиња.",
            "We use only cookies that are necessary for signing in and for running the platform, and one entry in the guest's browser local storage, so the invitation remembers the guest's answer. We have no analytics, advertising or third-party cookies. That is why we do not ask for cookie consent.",
          ),
        },
        {
          type: "table",
          head: [bi("Колаче", "Cookie"), bi("Намена", "Purpose"), bi("Траење", "Duration")],
          rows: [
            [
              bi("couple_session", "couple_session"),
              bi("Ја одржува најавата на клиентот на локалот.", "Keeps the venue's client signed in."),
              bi(`${R.coupleSessionDays} дена од последното користење.`, `${R.coupleSessionDays} days from last use.`),
            ],
            [
              bi("sb-…-auth-token", "sb-…-auth-token"),
              bi("Ја одржува најавата на вработениот во локалот.", "Keeps venue staff signed in."),
              bi("До одјава или до истекот на сесијата.", "Until sign-out or until the session expires."),
            ],
            [
              bi("sb-…-auth-token-code-verifier", "sb-…-auth-token-code-verifier"),
              bi("Безбедносен код при промена на лозинка преку е-пошта.", "Security code when resetting a password by email."),
              bi("Неколку минути.", "A few minutes."),
            ],
            [
              bi("maintenance_bypass", "maintenance_bypass"),
              bi(
                "Му овозможува на нашиот тим да ја отвори платформата за време на одржување. Се поставува само за нашиот тим.",
                "Lets our team open the platform during maintenance. Set only for our team.",
              ),
              bi("До 12 часа.", "Up to 12 hours."),
            ],
            [
              bi("rsvp-remember:… (локално складиште)", "rsvp-remember:… (local storage)"),
              bi(
                "Го памети гостинот што одговорил преку заедничкиот линк на поканата, за следниот одговор да го ажурира истиот гостин.",
                "Remembers the guest who answered through the invitation's shared link, so the next answer updates the same guest.",
              ),
              bi(`${R.rsvpRememberDays} дена, или до „Не сте вие?“.`, `${R.rsvpRememberDays} days, or until "Not you?".`),
            ],
          ],
        },
      ],
    },
    {
      id: "rights",
      heading: bi("Вашите права", "Your rights"),
      blocks: [
        {
          type: "ul",
          items: [
            bi("Пристап до податоците и копија од нив.", "Access to your data and a copy of it."),
            bi("Исправка на неточни податоци.", "Correction of inaccurate data."),
            bi("Бришење.", "Erasure."),
            bi("Ограничување на обработката.", "Restriction of processing."),
            bi("Преносливост на податоците.", "Data portability."),
            bi("Повлекување на согласноста, кога обработката се заснова на согласност, без тоа да влијае на претходната обработка.", "Withdrawal of consent, where processing is based on consent, without affecting earlier processing."),
          ],
        },
        {
          type: "p",
          text: bi(
            "Право на приговор: во секое време можете да приговорите на обработка што се заснова на легитимен интерес, од причини поврзани со вашата посебна ситуација. Тогаш обработката престанува, освен ако постојат убедливи легитимни основи што преовладуваат.",
            "Right to object: you can object at any time to processing based on legitimate interest, on grounds relating to your particular situation. The processing then stops unless there are compelling legitimate grounds that override it.",
          ),
        },
        {
          type: "p",
          text: bi(
            `За сметките на вработените, пораките од формуларот за контакт, барањата за демо и барањата за поддршка на локалот пишете ни на ${P.privacyEmail}. За податоците за настан, гости или резервации обратете се до локалот; ако ни пишете нам, ќе го проследиме барањето. Одговараме во рок од еден месец, а во сложени случаи рокот може да се продолжи уште два месеци, за што ќе ве известиме.`,
            `For staff accounts, contact-form messages, demo requests and the venue's support requests write to us at ${P.privacyEmail}. For data about an event, guests or reservations contact the venue; if you write to us, we forward the request. We answer within one month; in complex cases the period can be extended by two more months, and we will tell you.`,
          ),
        },
        {
          type: "p",
          text: bi(
            "Во поставките на локалот постојат алатки за овие барања: извоз на сите податоци на локалот, бришење на личните податоци на еден настан и бришење на целата сметка со сите податоци. Клиентот може сам да преземе копија од податоците за својот настан во контролната табла, додека трае пристапот.",
            "The venue settings have tools for these requests: export of all the venue's data, erasure of the personal data of a single event, and deletion of the whole account with all its data. The client can download a copy of its event's data in the dashboard itself, while the access lasts.",
          ),
        },
        {
          type: "p",
          text: bi(
            `Имате право на приговор до Агенцијата за заштита на личните податоци (www.azlp.mk). Ако живеете во ЕУ, можете да поднесете приговор и до органот за заштита на податоците во вашата земја.`,
            `You have the right to lodge a complaint with the Personal Data Protection Agency (Агенција за заштита на личните податоци, www.azlp.mk). If you live in the EU, you can also complain to the data protection authority in your country.`,
          ),
        },
      ],
    },
    {
      id: "children",
      heading: bi("Деца", "Children"),
      blocks: [
        {
          type: "p",
          text: bi(
            "Платформата не е наменета за деца. Листите на гости може да содржат имиња на деца што ги внеле младенците или организаторот; тие се обработуваат исто како и другите податоци за гостите.",
            "The platform is not intended for children. Guest lists may contain names of children entered by the couple or organizer; they are processed like other guest data.",
          ),
        },
      ],
    },
    {
      id: "changes",
      heading: bi("Измени на политиката", "Changes to this policy"),
      blocks: [
        {
          type: "p",
          text: bi(
            "Новата верзија ја објавуваме на оваа страница со датум на измена. За суштински измени ги известуваме локалите по е-пошта пред измената да стапи во сила.",
            "We publish each new version on this page with its date. We notify venues of material changes by email before they take effect.",
          ),
        },
      ],
    },
  ],
};

export const privacyBilingual = privacyDocument;

export function getPrivacyPolicy(lang: Lang): LegalDocument {
  return localize(privacyDocument, lang, { lastUpdated: LEGAL_LAST_UPDATED, version: LEGAL_VERSION });
}

export const privacy = { mk: getPrivacyPolicy("mk"), en: getPrivacyPolicy("en") };
