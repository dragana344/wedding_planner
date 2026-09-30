// Data Processing Agreement with venues (COMP-005), Macedonian and English,
// published at /dpa and /en/dpa and accepted with the Terms at signup
// (venues.terms_version / terms_accepted_at, migration 0046). Sub-processors
// and periods come from lib/legal/facts.ts; tests/lib/pure/legal-parity.test.ts
// keeps both languages and the facts in step. Review record:
// docs/production/LEGAL-REVIEW.md. The role allocation is still to be
// confirmed by legal review.

import { LEGAL_LAST_UPDATED, LEGAL_VERSION, PLACEHOLDERS as P, RETENTION_FACTS as R, SECURITY_FACTS as S } from "./facts";
import { localize, type Bi, type BiDocument, type Lang, type LegalDocument } from "./types";

const bi = (mk: string, en: string): Bi => ({ mk, en });

const dpaDocument: BiDocument = {
  title: bi("Договор за обработка на лични податоци", "Data Processing Agreement"),
  description: bi(
    "Договор меѓу локалот (контролор) и платформата КАДЕ СУМ? (обработувач) за личните податоци на клиентите и гостите на локалот.",
    "Agreement between the venue (controller) and the КАДЕ СУМ? platform (processor) on the personal data of the venue's clients and guests.",
  ),
  intro: [
    bi(
      "Овој договор се склучува согласно Законот за заштита на личните податоци (Службен весник на Република Северна Македонија бр. 42/2020) и, каде што е применлива, член 28 од Општата регулатива за заштита на податоците (ЕУ) 2016/679 (GDPR). Тој е составен дел од Условите за користење на платформата.",
      "This agreement is made under the Law on Personal Data Protection (Official Gazette of the Republic of North Macedonia No. 42/2020) and, where applicable, Article 28 of the General Data Protection Regulation (EU) 2016/679 (GDPR). It forms part of the platform's Terms of Service.",
    ),
    bi(
      `Овој документ е објавен на македонски и англиски јазик. Во случај на разлика, преовладува верзијата на: ${P.prevailingLanguage}.`,
      `This document is published in Macedonian and English. In case of a difference, the version that prevails is: ${P.prevailingLanguage}.`,
    ),
  ],
  sections: [
    {
      id: "parties",
      heading: bi("Страни", "Parties"),
      blocks: [
        {
          type: "ul",
          items: [
            bi(
              "Контролор: локалот што регистрирал сметка на платформата и ги прифатил Условите за користење, со податоците внесени во сметката („локалот“).",
              "Controller: the venue that registered an account on the platform and accepted the Terms of Service, with the details entered in the account (\"the venue\").",
            ),
            bi(
              `Обработувач: ${P.company}, ${P.address}, ЕМБС ${P.regNo}, контакт за приватност: ${P.privacyEmail} („обработувачот“).`,
              `Processor: ${P.company}, ${P.address}, registration no. ${P.regNo}, privacy contact: ${P.privacyEmail} ("the processor").`,
            ),
          ],
        },
      ],
    },
    {
      id: "subject",
      heading: bi("Предмет и траење", "Subject matter and duration"),
      blocks: [
        {
          type: "p",
          text: bi(
            "Обработувачот ја дава платформата КАДЕ СУМ? на локалот и при тоа ги обработува личните податоци што ги внесуваат локалот и неговите клиенти, преку алатките што локалот им ги нуди на клиентите како дел од својата услуга (листа на гости, покана, белешки, буџет и други алатки за планирање), како и податоците што гостите ги внесуваат преку линкот од поканата. Вработените во локалот не ги гледаат листата на гости и содржината за планирање на клиентот во панелот, но локалот може да ги извезе или избрише.",
            "The processor provides the КАДЕ СУМ? platform to the venue and, in doing so, processes the personal data entered by the venue and by its clients through the tools the venue makes available to them as part of its service (guest list, invitation, notes, budget and other planning tools), and the data guests enter through the invitation link. The venue's staff do not see the guest list or the client's planning content in the panel, but the venue can export or erase it.",
          ),
        },
        {
          type: "p",
          text: bi(
            "Договорот важи додека обработувачот ја дава услугата на локалот; обврските за бришење (точка „Бришење и враќање на податоците“) важат и по престанокот. Податоците за сметките на вработените во локалот, пораките од формуларот за контакт и безбедносните записи не се предмет на овој договор: за нив обработувачот е контролор (види Политиката за приватност).",
            "This agreement applies for as long as the processor provides the service to the venue; the deletion obligations (section \"Deletion and return of data\") survive termination. Data about the venue's staff accounts, contact-form messages and security records are not covered by this agreement: for those the processor is the controller (see the Privacy Policy).",
          ),
        },
      ],
    },
    {
      id: "nature",
      heading: bi("Природа и цел на обработката", "Nature and purpose of processing"),
      blocks: [
        {
          type: "ul",
          items: [
            bi(
              "Природа: чување, прикажување, пренос, резервно копирање, извоз и бришење на податоци во платформата.",
              "Nature: storing, displaying, transmitting, backing up, exporting and erasing data in the platform.",
            ),
            bi(
              "Цел: давање на функциите на платформата: настани и клиенти, резервации, распоред на маси, листи на гости, дигитални покани и одговори преку линк, алатки за планирање на клиентите (белешки, агенда, локации, буџет, листа на задачи), портфолио со фотографии.",
              "Purpose: providing the platform's features: events and clients, reservations, table layouts, guest lists, digital invitations and answers through a link, the clients' planning tools (notes, agenda, locations, budget, to-do list), a photo portfolio.",
            ),
            bi(
              "Обработувачот не ги користи податоците за свои цели, не ги продава и не ги користи за рекламирање.",
              "The processor does not use the data for its own purposes, does not sell it and does not use it for advertising.",
            ),
          ],
        },
      ],
    },
    {
      id: "data",
      heading: bi("Категории на лица и податоци", "Categories of data subjects and data"),
      blocks: [
        {
          type: "table",
          head: [bi("Лица", "Data subjects"), bi("Податоци", "Data")],
          rows: [
            [
              bi("Клиенти на локалот (младенци, организатори)", "Venue clients (couples, organizers)"),
              bi(
                "Имиња; датум, време и вид на настанот; е-пошта и телефон за контакт; вкупна цена и платен депозит (евиденција, без обработка на плаќања); корисничко име и лозинка (само хаш); сесија за најава (само хаш); белешки, агенда, локации (можна приватна адреса), буџет, листа на задачи; текст и фотографија на поканата; ознаки на маси.",
                "Names; date, time and type of the event; contact email and phone; total price and deposit paid (a record, no payment processing); username and password (hash only); sign-in session (hash only); notes, agenda, locations (possibly a private address), budget, to-do list; invitation text and photo; table labels.",
              ),
            ],
            [
              bi("Гости", "Guests"),
              bi(
                "Име и презиме; телефон (по избор); број на лица; одговор на поканата; страна; белешки; време на последната промена на одговорот преку линкот и претходниот одговор.",
                "Full name; phone (optional); party size; invitation answer; side; notes; time of the last change of the answer through the link and the previous answer.",
              ),
            ],
            [
              bi("Гости со резервација", "Reservation customers"),
              bi(
                "Име; телефон; е-пошта (по избор); датум и време; број на лица; вид на настан; белешка.",
                "Name; phone; email (optional); date and time; party size; event type; note.",
              ),
            ],
            [bi("Луѓе на фотографии од настани", "People in event photos"), bi("Фотографии во портфолиото на локалот.", "Photos in the venue's portfolio.")],
            [
              bi("Трети лица наведени во слободен текст", "Third parties named in free text"),
              bi("Имиња и податоци за контакт на добавувачи, членови на семејството и сл.", "Names and contact details of vendors, family members and similar."),
            ],
          ],
        },
        {
          type: "p",
          text: bi(
            "Посебни категории: полињата за белешки може да содржат податоци за здравјето или верските убедувања (исхрана, алергии, потреби за пристап). Локалот одговара тие да се внесуваат само кога се потребни, со изречна согласност на лицето или врз друг основ од член 9(2) од GDPR, односно соодветната одредба од Законот за заштита на личните податоци.",
            "Special categories: the notes fields may contain data about health or religious beliefs (diet, allergies, access needs). The venue is responsible for these being entered only when needed, with the data subject's explicit consent or on another ground of Art. 9(2) GDPR or the corresponding provision of the Law on Personal Data Protection.",
          ),
        },
      ],
    },
    {
      id: "venue",
      heading: bi("Обврски на локалот", "Venue's obligations"),
      blocks: [
        {
          type: "p",
          text: bi(
            "Локалот обезбедува правен основ за обработката, ги информира своите клиенти и гости (и ги упатува клиентите да ги информираат гостите), дава упатства само во согласност со закон и ги користи алатките во поставките за барањата на лицата.",
            "The venue ensures a legal basis for the processing, informs its clients and guests (and instructs its clients to inform their guests), gives only lawful instructions and uses the tools in the settings for data subjects' requests.",
          ),
        },
      ],
    },
    {
      id: "processor",
      heading: bi("Обврски на обработувачот", "Processor's obligations"),
      blocks: [
        {
          type: "ul",
          items: [
            bi(
              "Ги обработува податоците само според документирани упатства на локалот, вклучително во однос на пренос во трети земји, освен ако тоа го бара закон; во тој случај го известува локалот пред обработката, освен ако законот тоа го забранува. Упатствата се овој договор, Условите за користење и дејствата на локалот во платформата. Ако смета дека упатство е спротивно на закон, веднаш го известува локалот.",
              "Processes the data only on the venue's documented instructions, including with regard to transfers to third countries, unless required to do so by law; in that case it informs the venue before processing unless the law prohibits it. The instructions are this agreement, the Terms of Service and the venue's actions in the platform. If it believes an instruction infringes the law, it informs the venue immediately.",
            ),
            bi(
              "Обезбедува лицата овластени за обработка да се обврзани на доверливост.",
              "Ensures that the people authorised to process the data are bound by confidentiality.",
            ),
            bi("Ги применува безбедносните мерки од овој договор.", "Applies the security measures in this agreement."),
            bi("Ангажира подобработувачи само според овој договор.", "Engages sub-processors only under this agreement."),
            bi(
              "Му помага на локалот при барањата на лицата, при безбедноста на обработката, при известувањето за повреди, при проценката на влијанието врз заштитата на податоците и при претходното консултирање со надзорниот орган.",
              "Assists the venue with data subjects' requests, with the security of processing, with breach notification, with data protection impact assessments and with prior consultation of the supervisory authority.",
            ),
            bi(
              "Води евиденција за активностите на обработка што ги врши во име на локалот.",
              "Keeps a record of the processing activities it carries out on the venue's behalf.",
            ),
            bi("Ги брише податоците по престанокот според овој договор.", "Deletes the data after termination under this agreement."),
            bi(
              "Му ги дава на локалот информациите потребни за да се докаже усогласеноста и овозможува ревизии.",
              "Gives the venue the information needed to demonstrate compliance and allows audits.",
            ),
          ],
        },
      ],
    },
    {
      id: "security",
      heading: bi("Безбедносни мерки", "Security measures"),
      blocks: [
        {
          type: "ul",
          items: [
            bi(
              "Хостинг во ЕУ: база на податоци, најава и складиште кај Supabase во регионот eu-west-1 (Ирска); серверски функции кај Vercel во регионот dub1 (Даблин).",
              "EU hosting: database, sign-in and storage at Supabase in region eu-west-1 (Ireland); server functions at Vercel in region dub1 (Dublin).",
            ),
            bi("Шифрирање при пренос: целиот сообраќај оди преку HTTPS.", "Encryption in transit: all traffic uses HTTPS."),
            bi(
              "Одвојување на локалите: правила за пристап на ниво на ред (Row Level Security) во базата; секое барање на вработен се проверува против неговиот локал. Табелите со податоци за гостите и планирањето немаат пристап од прелистувачот; до нив се стигнува само преку серверот, ограничено на еден настан.",
              "Separation between venues: Row Level Security in the database; every staff request is checked against the staff member's venue. The guest and planning tables have no browser access; they are reached only through the server, scoped to one event.",
            ),
            bi(
              `Лозинки и сесии: лозинките се чуваат само како bcrypt хаш, најмалку ${S.minPasswordLength} знаци. Сесиите на клиентите се чуваат само како SHA-256 хаш и истекуваат ${R.coupleSessionDays} дена по последното користење. Заклучување на најавата на клиентот по ${S.coupleLoginMaxAttempts} неуспешни обиди на ${S.coupleLockoutMinutes} минути.`,
              `Passwords and sessions: passwords are stored only as a bcrypt hash, at least ${S.minPasswordLength} characters. Client sessions are stored only as a SHA-256 hash and expire ${R.coupleSessionDays} days after last use. A client sign-in is locked for ${S.coupleLockoutMinutes} minutes after ${S.coupleLoginMaxAttempts} failed attempts.`,
            ),
            bi(
              "Двофакторска автентикација (TOTP) по избор за вработените; кога е вклучена, базата не дава податоци без втор фактор.",
              "Two-factor authentication (TOTP), optional for staff; when enabled, the database returns no data without the second factor.",
            ),
            bi(
              `Ограничување на барањата за најавите на клиентите, регистрација, формулар за контакт, одговори и прикачување фотографии; бројачите содржат само хаш и се бришат по ${R.rateLimitCounterDays} ден.`,
              `Rate limiting for client sign-ins, sign-up, the contact form, answers and photo uploads; counters contain only a hash and are deleted after ${R.rateLimitCounterDays} day.`,
            ),
            bi(
              "Ревизорски дневник само за додавање (append-only) за безбедносно важни дејства, без имиња и податоци за контакт.",
              "Append-only audit log of security-relevant actions, without names or contact details.",
            ),
            bi(
              "Јавни фотографии: листањето на складиштето е оневозможено; фотографија се отвора само со нејзината точна адреса. Фотографиите се бришат кога ќе се избрише нивниот запис.",
              "Public photos: listing of the storage is disabled; a photo opens only with its exact address. Photos are deleted when their record is deleted.",
            ),
            bi(
              "Извештаи за грешки (Sentry, ако е вклучен): поставени да не содржат содржина на барања, колачиња, идентитет на корисникот и линкови од покани.",
              "Error reports (Sentry, if enabled): configured to exclude request content, cookies, user identity and invitation links.",
            ),
            bi(
              `Резервни копии: дневни копии кај Supabase (${R.databaseBackupDays} дена) и ноќни копии во Cloudflare R2 во ЕУ (${R.offsiteBackupDays} дена, планирано), шифрирани пред да се прикачат.`,
              `Backups: daily copies at Supabase (${R.databaseBackupDays} days) and nightly copies in Cloudflare R2 in the EU (${R.offsiteBackupDays} days, planned), encrypted before upload.`,
            ),
            bi(
              "Контрола на пристап на персоналот: пристап до производствените податоци има само мал број овластени лица, а листата се прегледува редовно.",
              "Staff access control: only a small number of authorised people can access production data, and the list is reviewed regularly.",
            ),
            bi(
              "Класификација на податоците: автоматски тест не дозволува нова колона во базата без да се означи дали содржи лични податоци.",
              "Data classification: an automated test does not allow a new database column unless it is marked as containing personal data or not.",
            ),
          ],
        },
      ],
    },
    {
      id: "subprocessors",
      heading: bi("Подобработувачи", "Sub-processors"),
      blocks: [
        {
          type: "p",
          text: bi("Локалот дава општо овластување за следниве подобработувачи:", "The venue gives general authorisation for the following sub-processors:"),
        },
        {
          type: "table",
          head: [bi("Подобработувач", "Sub-processor"), bi("Услуга", "Service"), bi("Податоци", "Data"), bi("Локација", "Location"), bi("Статус", "Status")],
          rows: [
            [
              bi("Supabase", "Supabase"),
              bi("База на податоци, најава, складиште, дневни резервни копии", "Database, sign-in, storage, daily backups"),
              bi("Сите податоци од овој договор", "All data in this agreement"),
              bi("ЕУ, Ирска (eu-west-1)", "EU, Ireland (eu-west-1)"),
              bi("Активен", "Active"),
            ],
            [
              bi("Vercel", "Vercel"),
              bi("Хостинг и серверски функции", "Hosting and server functions"),
              bi(
                "Податоци при пренос; записи за барањата (IP-адреса, адреса на страницата (URL), прелистувач)",
                "Data in transit; request records (IP address, page address (URL), browser)",
              ),
              bi("ЕУ, Даблин (dub1) за функциите", "EU, Dublin (dub1) for functions"),
              bi("Активен", "Active"),
            ],
            [
              bi("Resend", "Resend"),
              bi("Испраќање е-пошта", "Sending email"),
              bi("Е-пошта на примачот и содржина на пораката", "Recipient email and message content"),
              bi("ЕУ", "EU"),
              bi("Планиран", "Planned"),
            ],
            [
              bi("Sentry", "Sentry"),
              bi("Следење на грешки", "Error monitoring"),
              bi("Технички опис на грешката, поставен да не содржи лични податоци", "Technical description of the error, configured to exclude personal data"),
              bi("ЕУ, Франкфурт", "EU, Frankfurt"),
              bi("Планиран, само ако е вклучен", "Planned, only if enabled"),
            ],
            [
              bi("Cloudflare R2", "Cloudflare R2"),
              bi("Резервни копии надвор од главната инфраструктура", "Off-site backups"),
              bi("Шифрирана копија од базата и фотографиите", "An encrypted copy of the database and the photos"),
              bi("ЕУ", "EU"),
              bi("Планиран", "Planned"),
            ],
            [
              bi("GitHub", "GitHub"),
              bi("Извршување на ноќната задача за резервни копии (GitHub Actions)", "Running the nightly backup job (GitHub Actions)"),
              bi(
                "Привремено, додека трае задачата: копија од базата и фотографиите пред шифрирање",
                "Temporarily, while the job runs: a copy of the database and the photos before encryption",
              ),
              bi(P.githubRunnerLocation, P.githubRunnerLocation),
              bi("Планиран", "Planned"),
            ],
          ],
        },
        {
          type: "p",
          text: bi(
            `Обработувачот со секој подобработувач има договор со обврски за заштита на податоците што не се помали од овие. За додавање или замена на подобработувач го известува локалот најмалку ${P.subprocessorNotice} однапред; локалот може да приговори, а ако не се постигне решение, може да ја избрише сметката. Обработувачот одговара за подобработувачите како за себе.`,
            `The processor has a contract with each sub-processor with data protection obligations no less protective than these. It informs the venue of any added or replaced sub-processor at least ${P.subprocessorNotice} in advance; the venue may object and, if no solution is found, may delete its account. The processor remains liable for its sub-processors as for itself.`,
          ),
        },
        {
          type: "p",
          text: bi(
            "Пренос надвор од ЕУ: податоците се чуваат во ЕУ. Подобработувачите се компании со седиште во САД; кога нивниот персонал пристапува од земја надвор од ЕУ, или кога задачата за резервни копии се извршува надвор од ЕУ, се применуваат заштитните мерки од нивните договори за обработка (на пример стандардни договорни клаузули).",
            "Transfers outside the EU: the data is stored in the EU. The sub-processors are companies headquartered in the United States; when their staff access data from a country outside the EU, or when the backup job runs outside the EU, the safeguards in their data processing agreements apply (for example standard contractual clauses).",
          ),
        },
      ],
    },
    {
      id: "rights",
      heading: bi("Помош при правата на лицата", "Assistance with data subjects' rights"),
      blocks: [
        {
          type: "ul",
          items: [
            bi(
              "Во поставките на локалот: извоз на сите податоци на локалот (JSON), бришење на личните податоци на настан (гости, белешки, агенда, локации, буџет, листа на задачи, покана и фотографии, податоци за најава на клиентот; останува запис за настанот без имиња, податоци за контакт и податоци за гостите) и бришење на сметката.",
              "In the venue settings: export of all the venue's data (JSON), erasure of an event's personal data (guests, notes, agenda, locations, budget, to-do list, invitation and photos, the client's sign-in data; a record of the event without names, contact details or guest data remains) and account deletion.",
            ),
            bi(
              "На барање на локалот, обработувачот дава извоз на податоците за еден настан (за барање за пристап од клиент).",
              "On the venue's request, the processor provides an export of the data of a single event (for a client's access request).",
            ),
            bi(
              "Ако обработувачот прими барање директно од клиент или гостин, го проследува до локалот без непотребно одложување и не одговара самостојно, освен по упатство на локалот.",
              "If the processor receives a request directly from a client or guest, it forwards it to the venue without undue delay and does not answer on its own, except on the venue's instructions.",
            ),
          ],
        },
      ],
    },
    {
      id: "deletion",
      heading: bi("Бришење и враќање на податоците", "Deletion and return of data"),
      blocks: [
        {
          type: "ul",
          items: [
            bi(
              "Пред престанокот, локалот може да ги извези сите податоци.",
              "Before termination, the venue can export all its data.",
            ),
            bi(
              `Кога услугата ќе престане од која било причина (бришење на сметката, затворање од страна на обработувачот или престанок на договорот), локалот има ${R.exportWindowAfterEndDays} дена да ги извезе податоците, а потоа обработувачот ги брише сите лични податоци обработени за локалот. На барање обработувачот писмено го потврдува бришењето.`,
              `When the service ends for any reason (account deletion, closure by the processor or end of the contract), the venue has ${R.exportWindowAfterEndDays} days to export its data, after which the processor deletes all personal data processed for the venue. On request the processor confirms the deletion in writing.`,
            ),
            bi(
              "Бришењето на сметката од страна на локалот е веднаш и трајно: се бришат локалот, сите настани, клиенти, гости, резервации, фотографии и сметките на вработените. Остануваат само записите во ревизорскиот дневник, кои содржат внатрешни идентификатори без имиња и податоци за контакт.",
              "Account deletion by the venue is immediate and permanent: the venue, all events, clients, guests, reservations, photos and staff accounts are deleted. Only the audit-log entries remain, which contain internal identifiers without names or contact details.",
            ),
            bi(
              `Избришаните податоци исчезнуваат од резервните копии најдоцна по ${R.offsiteBackupDays} дена (Supabase: ${R.databaseBackupDays} дена; Cloudflare R2: ${R.offsiteBackupDays} дена). По секое враќање од резервна копија, обработувачот повторно ги применува сите бришења запишани во ревизорскиот дневник по создавањето на копијата.`,
              `Deleted data disappears from backups after ${R.offsiteBackupDays} days at the latest (Supabase: ${R.databaseBackupDays} days; Cloudflare R2: ${R.offsiteBackupDays} days). After any restore from a backup, the processor re-applies all erasures recorded in the audit log since the backup was made.`,
            ),
            bi(
              `Стандардно, и освен ако локалот не побара друг рок по е-пошта, локалот му наложува на обработувачот автоматски да ги брише личните податоци на клиентите и гостите на настанот ${R.guestDataMonthsAfterEvent} месеци по датумот на настанот.`,
              `By default, and unless the venue asks for a different period by email, the venue instructs the processor to erase the personal data of an event's clients and guests automatically ${R.guestDataMonthsAfterEvent} months after the event date.`,
            ),
            bi(
              "Обработувачот не задржува копии освен кога тоа го бара закон.",
              "The processor keeps no copies unless the law requires it.",
            ),
          ],
        },
      ],
    },
    {
      id: "breach",
      heading: bi("Повреда на безбедноста на личните податоци", "Personal data breach"),
      blocks: [
        {
          type: "p",
          text: bi(
            `Обработувачот го известува локалот без непотребно одложување, а најдоцна ${S.breachNotificationHours} часа откако ќе дознае за повредата, по е-пошта на регистрираната адреса на локалот и на контактот за приватност што локалот го дал. Известувањето содржи, колку што е познато: природата на повредата, категориите и приближниот број на засегнати лица и записи, веројатните последици, преземените и предложените мерки и лице за контакт. Ако не се достапни сите информации, ги доставува во фази. Обработувачот води евиденција за сите повреди што ги засегаат податоците на локалот и му помага на локалот да ги извести Агенцијата за заштита на личните податоци и засегнатите лица кога тоа е потребно.`,
            `The processor notifies the venue without undue delay and no later than ${S.breachNotificationHours} hours after becoming aware of a breach, by email to the venue's registered address and to any privacy contact the venue has given. The notice includes, as far as known: the nature of the breach, the categories and approximate number of data subjects and records concerned, the likely consequences, the measures taken and proposed, and a contact person. If not all information is available, it provides it in phases. The processor keeps a record of all breaches affecting the venue's data and helps the venue notify the Personal Data Protection Agency (Агенција за заштита на личните податоци) and the data subjects when required.`,
          ),
        },
      ],
    },
    {
      id: "audits",
      heading: bi("Ревизии", "Audits"),
      blocks: [
        {
          type: "p",
          text: bi(
            `Обработувачот на барање ги дава информациите потребни за да се докаже усогласеноста со овој договор (вклучително опис на мерките). Локалот или ревизор обврзан на доверливост може да изврши ревизија со најава најмалку ${P.auditNotice} однапред, во работно време и без пристап до податоци на други локали. Трошоците за ревизијата ги сноси локалот, освен ако ревизијата открие суштинско прекршување на овој договор.`,
            `On request, the processor provides the information needed to demonstrate compliance with this agreement (including a description of the measures). The venue, or an auditor bound by confidentiality, may carry out an audit with at least ${P.auditNotice} prior notice, during business hours and without access to other venues' data. The venue bears the cost of the audit unless it reveals a material breach of this agreement.`,
          ),
        },
      ],
    },
    {
      id: "final",
      heading: bi("Завршни одредби", "Final provisions"),
      blocks: [
        {
          type: "p",
          text: bi(
            `За одговорноста се применуваат Условите за користење; тие не ги ограничуваат правата на лицата чии податоци се обработуваат. За овој договор се применува правото на Република Северна Македонија, а споровите ги решава ${P.court}. При судир меѓу овој договор и Условите за користење во однос на заштитата на податоците, преовладува овој договор.`,
            `Liability is governed by the Terms of Service; they do not limit the rights of the data subjects. This agreement is governed by the law of the Republic of North Macedonia, and disputes are decided by ${P.court}. If this agreement and the Terms of Service conflict on data protection, this agreement prevails.`,
          ),
        },
      ],
    },
    {
      id: "acceptance",
      heading: bi("Прифаќање", "Acceptance"),
      blocks: [
        {
          type: "p",
          text: bi(
            "Договорот се прифаќа електронски заедно со Условите за користење при регистрација; платформата ги запишува верзијата и времето на прифаќањето. На барање, договорот може да се потпише:",
            "This agreement is accepted electronically together with the Terms of Service at sign-up; the platform records the version and time of acceptance. On request, it can be signed:",
          ),
        },
        {
          type: "table",
          head: [bi("", ""), bi("Контролор", "Controller"), bi("Обработувач", "Processor")],
          rows: [
            [bi("Име и функција", "Name and title"), bi(P.venueSignatory, P.venueSignatory), bi(P.companySignatory, P.companySignatory)],
            [bi("Датум", "Date"), bi(P.signatureDate, P.signatureDate), bi(P.signatureDate, P.signatureDate)],
          ],
        },
      ],
    },
  ],
};

export const dpaBilingual = dpaDocument;

export function getDpa(lang: Lang): LegalDocument {
  return localize(dpaDocument, lang, { lastUpdated: LEGAL_LAST_UPDATED, version: LEGAL_VERSION });
}

export const dpa = { mk: getDpa("mk"), en: getDpa("en") };
