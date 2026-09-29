// Terms of service (COMP-001), Macedonian and English. The data processing
// terms for venues (COMP-005) are /dpa (lib/legal/dpa.ts) and referenced from the "data" section.
// Review record:
// docs/production/LEGAL-REVIEW.md.

import { LEGAL_LAST_UPDATED, LEGAL_VERSION, PLACEHOLDERS as P, RETENTION_FACTS as R } from "./facts";
import { localize, type Bi, type BiDocument, type Lang, type LegalDocument } from "./types";

const bi = (mk: string, en: string): Bi => ({ mk, en });

const termsDocument: BiDocument = {
  title: bi("Услови за користење", "Terms of Service"),
  description: bi(
    "Условите под кои локалите, нивните клиенти и гостите ја користат платформата КАДЕ СУМ?.",
    "The terms under which venues, their clients and guests use the КАДЕ СУМ? platform.",
  ),
  intro: [
    bi(
      `Овие услови важат меѓу ${P.company}, ${P.address}, ЕМБС ${P.regNo} („ние“), и локалот (правно лице или трговец) што регистрира сметка на платформата КАДЕ СУМ? на ${P.domain}. Со регистрација на локал ги прифаќате овие услови, вклучително Договорот за обработка на лични податоци, во име на локалот. За клиентите и гостите на локалот важи само делот „Клиенти и гости“.`,
      `These terms apply between ${P.company}, ${P.address}, registration number ${P.regNo} ("we"), and the venue (a company or trader) that registers an account on the КАДЕ СУМ? platform at ${P.domain}. By registering a venue you accept these terms, including the Data Processing Agreement, on the venue's behalf. For the venue's clients and guests only the section "Clients and guests" applies.`,
    ),
    bi(
      `Овој документ е објавен на македонски и англиски јазик. Во случај на разлика, преовладува верзијата на: ${P.prevailingLanguage}.`,
      `This document is published in Macedonian and English. In case of a difference, the version that prevails is: ${P.prevailingLanguage}.`,
    ),
  ],
  sections: [
    {
      id: "definitions",
      heading: bi("Поими", "Definitions"),
      blocks: [
        {
          type: "ul",
          items: [
            bi("„Локал“: ресторан, сала или друг објект што има сметка на платформата.", "\"Venue\": a restaurant, hall or other business that has an account on the platform."),
            bi("„Вработен“: лице со сметка за најава на локалот.", "\"Staff member\": a person with a sign-in account for the venue."),
            bi(
              "„Клиент“: младенци или друг организатор на настан, со корисничко име и лозинка што ги издава локалот.",
              "\"Client\": a couple or other event organizer, with a username and password issued by the venue.",
            ),
            bi("„Гостин“: лице покането на настан преку линк од поканата.", "\"Guest\": a person invited to an event through an invitation link."),
          ],
        },
      ],
    },
    {
      id: "service",
      heading: bi("Услугата", "The service"),
      blocks: [
        {
          type: "p",
          text: bi(
            "Платформата им овозможува на локалите да управуваат со настани, резервации, простории, распоред на маси и менија, на клиентите да планираат настан (гости, покани, буџет, агенда, белешки), а на гостите да одговорат на покана. Функциите може да се менуваат и подобруваат со текот на времето.",
            "The platform lets venues manage events, reservations, rooms, table layouts and menus, lets clients plan an event (guests, invitations, budget, agenda, notes), and lets guests answer an invitation. Features may change and improve over time.",
          ),
        },
      ],
    },
    {
      id: "accounts",
      heading: bi("Сметки и пристап", "Accounts and access"),
      blocks: [
        {
          type: "ul",
          items: [
            bi(
              "Локалот е одговорен за точноста на податоците при регистрација и за тоа кој има пристап до неговата сметка. Препорачуваме вработените да вклучат двофакторска автентикација.",
              "The venue is responsible for accurate sign-up details and for who has access to its account. We recommend that staff turn on two-factor authentication.",
            ),
            bi(
              "Локалот ги издава корисничкото име и лозинката на клиентот и треба да ги предаде на безбеден начин. Клиентот ги чува во тајност.",
              "The venue issues the client's username and password and should hand them over securely. The client keeps them secret.",
            ),
            bi(
              "Линкот од поканата е единствениот клуч за поканата: секој што го има може да ја види поканата и да одговори на неа. Клиентот одлучува со кого ќе го сподели.",
              "The invitation link is the only key to the invitation: anyone who has it can see the invitation and answer it. The client decides whom to share it with.",
            ),
            bi(
              `Веднаш известете нè на ${P.supportEmail} ако мислите дека некој неовластено пристапил до сметка.`,
              `Tell us immediately at ${P.supportEmail} if you believe someone accessed an account without permission.`,
            ),
          ],
        },
      ],
    },
    {
      id: "fees",
      heading: bi("Цена", "Fees"),
      blocks: [
        {
          type: "p",
          text: bi(
            "Регистрацијата е бесплатна. Платените планови и нивната цена се договараат посебно со локалот, а плаќањето се врши надвор од платформата. Платформата не обработува плаќања и не чува податоци за платежни картички.",
            "Signing up is free. Paid plans and their price are agreed separately with the venue, and payment is made outside the platform. The platform processes no payments and stores no payment card data.",
          ),
        },
      ],
    },
    {
      id: "data",
      heading: bi("Лични податоци", "Personal data"),
      blocks: [
        {
          type: "p",
          text: bi(
            "Локалот е контролор за личните податоци на своите клиенти, нивните гости и своите резервации, а ние сме обработувач што ги обработува само по упатства на локалот. Локалот им ги нуди на своите клиенти алатките за планирање (листа на гости, покана, белешки, буџет) како дел од својата услуга; клиентот ги пополнува, а вработените во локалот не ги гледаат во панелот, но локалот може да ги извезе или избрише. Договорот за обработка на лични податоци, објавен на /dpa, е составен дел од овие услови и со прифаќањето на условите го прифаќате и него. Потпишана верзија испраќаме на барање.",
            "The venue is the controller of the personal data of its clients, their guests and its reservations, and we are a processor that processes it only on the venue's instructions. The venue makes the planning tools (guest list, invitation, notes, budget) available to its clients as part of its service; the client fills them in, and the venue's staff do not see them in the panel, but the venue can export or erase them. The Data Processing Agreement, published at /en/dpa, forms part of these terms, and by accepting the terms you also accept it. We send a signed version on request.",
          ),
        },
        {
          type: "p",
          text: bi("Локалот се обврзува:", "The venue undertakes to:"),
        },
        {
          type: "ul",
          items: [
            bi(
              "да има правен основ за податоците што ги внесува и да ги информира своите клиенти и гости за обработката;",
              "have a legal basis for the data it enters and inform its clients and guests about the processing;",
            ),
            bi(
              "да внесува податоци за здравјето или други чувствителни податоци (на пример алергии) само кога се потребни за настанот и лицето дало изречна согласност, и да ги упати клиентите да постапуваат исто;",
              "enter health or other sensitive data (for example allergies) only when it is needed for the event and the person has given explicit consent, and instruct its clients to do the same;",
            ),
            bi(
              "да прикачува фотографии на кои се препознаваат луѓе само со нивна согласност или друг правен основ;",
              "upload photos in which people are recognisable only with their consent or another legal basis;",
            ),
            bi(
              "да одговара на барањата на клиентите и гостите за нивните податоци, со помош на алатките во поставките.",
              "answer requests from clients and guests about their data, using the tools in the settings.",
            ),
          ],
        },
        {
          type: "p",
          text: bi(
            "Како ги обработуваме податоците е опишано во Политиката за приватност.",
            "How we process data is described in the Privacy Policy.",
          ),
        },
      ],
    },
    {
      id: "acceptable-use",
      heading: bi("Дозволено користење", "Acceptable use"),
      blocks: [
        {
          type: "p",
          text: bi("Забрането е:", "You must not:"),
        },
        {
          type: "ul",
          items: [
            bi("да се внесува незаконска содржина или податоци без правен основ;", "enter unlawful content or data without a legal basis;"),
            bi(
              "да се пристапува или да се обидува да се пристапи до податоци на друг локал, клиент или настан;",
              "access or try to access the data of another venue, client or event;",
            ),
            bi(
              "да се нарушува работата на платформата, да се заобиколуваат ограничувањата на барањата или безбедносните мерки;",
              "disrupt the platform or bypass rate limits or security measures;",
            ),
            bi("да се користи платформата за испраќање непобарани пораки.", "use the platform to send unsolicited messages."),
          ],
        },
      ],
    },
    {
      id: "content",
      heading: bi("Содржина и интелектуална сопственост", "Content and intellectual property"),
      blocks: [
        {
          type: "p",
          text: bi(
            "Податоците и содржината што ги внесувате остануваат ваши. Ни давате право да ги чуваме и прикажуваме само колку што е потребно за давање на услугата. Платформата, нејзиниот код и дизајн се наша сопственост.",
            "The data and content you enter remain yours. You give us the right to store and display them only as far as needed to provide the service. The platform, its code and design are our property.",
          ),
        },
      ],
    },
    {
      id: "availability",
      heading: bi("Достапност и резервни копии", "Availability and backups"),
      blocks: [
        {
          type: "p",
          text: bi(
            `Се трудиме платформата да биде достапна постојано, но не гарантираме непрекината работа. Може да ја прекинеме привремено поради одржување. Правиме дневни резервни копии кои се чуваат до ${R.offsiteBackupDays} дена; тие служат за враќање по инцидент, а не за враќање на поединечни податоци што сте ги избришале.`,
            `We aim to keep the platform available at all times but do not guarantee uninterrupted operation. We may interrupt it temporarily for maintenance. We make daily backups that are kept for up to ${R.offsiteBackupDays} days; they are for recovery after an incident, not for restoring individual items you deleted.`,
          ),
        },
      ],
    },
    {
      id: "termination",
      heading: bi("Престанок и бришење", "Termination and deletion"),
      blocks: [
        {
          type: "ul",
          items: [
            bi(
              "Локалот може во секое време да ги извези сите свои податоци и да ја избрише сметката во поставките. Бришењето е трајно: се бришат локалот, сите настани, клиенти, гости, резервации, фотографии и сметките на вработените.",
              "The venue can export all its data and delete its account in the settings at any time. Deletion is permanent: the venue, all events, clients, guests, reservations, photos and staff accounts are deleted.",
            ),
            bi(
              `Кога услугата ќе престане од која било причина (бришење, затворање од наша страна или престанок на договорот), локалот има ${R.exportWindowAfterEndDays} дена да ги извезе податоците, а потоа ги бришеме сите лични податоци обработени за локалот. На барање писмено го потврдуваме бришењето.`,
              `When the service ends for any reason (deletion, closure by us or end of the contract), the venue has ${R.exportWindowAfterEndDays} days to export its data, after which we delete all personal data processed for the venue. On request we confirm the deletion in writing.`,
            ),
            bi(
              `Избришаните податоци исчезнуваат од резервните копии најдоцна по ${R.offsiteBackupDays} дена.`,
              `Deleted data disappears from backups after ${R.offsiteBackupDays} days at the latest.`,
            ),
            bi(
              "Може да суспендираме или затвориме сметка што сериозно или повторено ги прекршува овие услови, по претходно известување освен кога е потребно итно дејство за да се заштитат други корисници или податоци.",
              "We may suspend or close an account that seriously or repeatedly breaches these terms, after prior notice unless urgent action is needed to protect other users or data.",
            ),
          ],
        },
      ],
    },
    {
      id: "clients-guests",
      heading: bi("Клиенти и гости", "Clients and guests"),
      blocks: [
        {
          type: "ul",
          items: [
            bi(
              "Клиентите пристапуваат со корисничко име и лозинка од локалот, а гостите со линкот од поканата. Не смеете да пристапувате до туѓи податоци ниту да го злоупотребувате линкот од поканата.",
              "Clients sign in with a username and password from the venue, and guests use the invitation link. You must not access other people's data or misuse the invitation link.",
            ),
            bi(
              "Клиентот е одговорен за тоа што го внесува за другите луѓе (на пример за гостите).",
              "The client is responsible for what it enters about other people (for example about guests).",
            ),
            bi(
              "Ништо во овие услови не ги ограничува вашите права како потрошувач или според прописите за заштита на личните податоци.",
              "Nothing in these terms limits your rights as a consumer or under data protection law.",
            ),
          ],
        },
      ],
    },
    {
      id: "liability",
      heading: bi("Одговорност", "Liability"),
      blocks: [
        {
          type: "p",
          text: bi(
            "Одговараме за штета предизвикана со намера или крајна небрежност и во други случаи кога одговорноста не може да се исклучи според закон. Во останатите случаи не одговараме за индиректна штета или изгубена добивка. Локалот одговара за податоците и содржината што ги внесува. Овој дел не ги ограничува правата на клиентите, гостите и другите лица според прописите за заштита на личните податоци или за заштита на потрошувачите.",
            "We are liable for damage caused intentionally or by gross negligence and in other cases where liability cannot be excluded by law. Otherwise we are not liable for indirect damage or lost profit. The venue is responsible for the data and content it enters. This section does not limit the rights of clients, guests or other data subjects under data protection or consumer protection law.",
          ),
        },
      ],
    },
    {
      id: "changes",
      heading: bi("Измени на условите", "Changes to these terms"),
      blocks: [
        {
          type: "p",
          text: bi(
            `За суштински измени ги известуваме локалите по е-пошта најмалку ${P.noticePeriod} пред да стапат во сила. Ако продолжите да ја користите платформата по тој датум, ги прифаќате изменетите услови; во спротивно може да ја избришете сметката.`,
            `We notify venues of material changes by email at least ${P.noticePeriod} before they take effect. If you keep using the platform after that date, you accept the changed terms; otherwise you can delete your account.`,
          ),
        },
      ],
    },
    {
      id: "law",
      heading: bi("Меродавно право и спорови", "Governing law and disputes"),
      blocks: [
        {
          type: "p",
          text: bi(
            `За овие услови се применува правото на Република Северна Македонија. Споровите ги решава ${P.court}, освен ако закон не пропишува поинаку.`,
            `These terms are governed by the law of the Republic of North Macedonia. Disputes are decided by ${P.court}, unless the law provides otherwise.`,
          ),
        },
      ],
    },
    {
      id: "contact",
      heading: bi("Контакт", "Contact"),
      blocks: [
        {
          type: "p",
          text: bi(
            `Поддршка: ${P.supportEmail}. Приватност: ${P.privacyEmail}.`,
            `Support: ${P.supportEmail}. Privacy: ${P.privacyEmail}.`,
          ),
        },
      ],
    },
  ],
};

export const termsBilingual = termsDocument;

export function getTerms(lang: Lang): LegalDocument {
  return localize(termsDocument, lang, { lastUpdated: LEGAL_LAST_UPDATED, version: LEGAL_VERSION });
}

export const terms = { mk: getTerms("mk"), en: getTerms("en") };
