








/**
 * SecureEscrow Kenya - Translations
 * English (en) and Swahili (sw) copy for every data-i18n key on the site.
 * Legal document body text is intentionally NOT translated here - see
 * legal.pendingNotice for why.
 */

const TRANSLATIONS = {
  en: {
    common: {
      nav: {
        home: "Home",
        import: "Import Phones",
        how: "How It Works",
        track: "Track Transaction",
        about: "About Us",
        contact: "Contact",
        startTransaction: "Start Transaction"
      },
      footer: {
        brandHeading: "SecureEscrow Kenya",
        tagline: "Protecting Kenyan online transactions through trusted third-party mediation since 2026.",
        badge: "Licensed and Regulated",
        quickAccess: "Quick Access",
        resources: "Resources",
        legal: "Legal",
        helpCenter: "Help Center",
        dispute: "Dispute Resolution",
        feeStructure: "Fee Structure",
        transactionSafety: "Transaction Safety",
        tos: "Terms of Service",
        privacy: "Privacy Policy",
        escrowAgreement: "Escrow Agreement",
        compliance: "Compliance",
        copyright: "\u00A9 2026 SecureEscrow Kenya Limited. All rights reserved."
      },
      ticker: { title: "Live Escrow Activity in Kenya" },
      loader: {
        tagline: "Securing Your Transaction",
        initializing: "Initializing secure environment\u2026"
      },
      trustStrip: {
        main: "Release Instant After Delivery Confirmation",
        sub: "Fast & Automated Payouts"
      }
    },

    home: {
      hero: {
        titleLine1: "Secure Your Online Transactions",
        titleHighlight: "in Kenya",
        description: "Protect your funds when buying or selling online. Money is held safely in escrow until you confirm delivery and satisfaction.",
        ctaPrimary: "Begin Escrow Transaction",
        ctaSecondary: "Learn How It Works",
        metricSecured: "Secured (KES)",
        metricUsers: "Active Users",
        metricFraud: "Fraud Rate"
      },
      form: {
        title: "Initiate Escrow Agreement",
        categoryLabel: "Transaction Category",
        categorySelect: "Select category",
        categoryProduct: "Physical Product",
        categoryDigital: "Digital Product",
        categoryService: "Professional Service",
        categoryVehicle: "Vehicle Purchase",
        itemLabel: "Item or Service Description",
        itemPlaceholder: "e.g. Samsung Galaxy S24 Ultra",
        detailsLabel: "Additional Details",
        detailsPlaceholder: "Include specific conditions, model numbers, or deliverables",
        amountLabel: "Amount (KES)",
        amountPlaceholder: "Enter amount",
        buyerContactLabel: "Your Contact",
        buyerContactPlaceholder: "Your M-PESA number",
        sellerContactLabel: "Seller Contact",
        sellerContactPlaceholder: "Seller's phone number",
        payoutTypeLabel: "Seller Payout Method",
        payoutMpesa: "M-PESA (Phone Number)",
        payoutTill: "Till Number",
        payoutPaybill: "Paybill Number",
        payoutNumberLabel: "Till / Paybill Number",
        payoutNumberPlaceholder: "Enter Till or Paybill number",
        payoutAccountLabel: "Account Number (for Paybill)",
        payoutAccountPlaceholder: "Enter account number",
        deadlineLabel: "Delivery Deadline",
        transactionAmount: "Transaction Amount",
        totalPayment: "Total Payment",
        continueBtn: "Continue to Payment Details",
        disclaimer: "Your funds are held securely and only released upon your confirmation"
      },
      trust: {
        title: "Why Businesses Choose SecureEscrow",
        subtitle: "Kenya's most reliable third-party transaction protection",
        card1Title: "Fund Protection",
        card1Desc: "All funds are held in segregated trust accounts with regulated Kenyan financial institutions.",
        card2Title: "Verified Process",
        card2Desc: "Every transaction is monitored by our compliance team to ensure fair outcomes.",
        card3Title: "Dispute Resolution",
        card3Desc: "Neutral arbitration available if buyer and seller cannot reach an agreement.",
        card4Title: "Quick Release",
        card4Desc: "Funds released to seller within 24 hours of buyer confirmation."
      },
      partners: { label: "Trusted by Leading Kenyan Businesses" }
    },

    import: {
      trust: {
        main: "Imported & Delivered by SecureEscrow \u2014 Not a Third Party",
        sub: "One Price. Full Responsibility, US to Kenya."
      },
      hero: {
        title: "Import Phones",
        subtitle: "SecureEscrow sources, imports and delivers these phones directly to you \u2014 we're responsible for your device from purchase in the United States through to your door in Kenya. The price you see is the price you pay, held safely in escrow until you confirm delivery."
      },
      loading: "Loading available phones\u2026",
      how: {
        title: "How An Import Order Works",
        subtitle: "SecureEscrow is the one importing, shipping and handling your device \u2014 end to end",
        step1Title: "You Order & Pay Into Escrow",
        step1Desc: "Pick a phone and pay the listed price. Your money goes into SecureEscrow's protected trust account \u2014 not to any third party.",
        step2Title: "SecureEscrow Sources & Imports It",
        step2Desc: "We purchase, ship and clear customs on your device ourselves. SecureEscrow is responsible for it from the United States all the way to Kenya \u2014 you'll get SMS updates as it progresses.",
        step3Title: "Delivered To You",
        step3Desc: "Your phone is delivered to the address you provided. Inspect it before confirming.",
        step4Title: "You Confirm, Funds Release",
        step4Desc: "Happy with it? Confirm via the secure link sent to your phone and funds are released. Not happy? Raise a dispute instead \u2014 SecureEscrow stands behind the device it imported for you."
      },
      modal: {
        title: "Order This Phone",
        nameLabel: "Your Name",
        namePlaceholder: "Full name",
        phoneLabel: "Your M-PESA Number",
        cityLabel: "City / Town",
        cityPlaceholder: "e.g. Kisumu",
        addressLabel: "Delivery Address",
        addressPlaceholder: "Estate, landmark, courier pickup point",
        notesLabel: "Notes (optional)",
        notesPlaceholder: "Anything we should know about your order",
        totalPayment: "Total Payment",
        confirmBtn: "Confirm & Pay Into Escrow",
        disclaimer: "Your payment is held securely and only released to us once you confirm delivery.",
        successTitle: "Order Placed",
        successText: "Check your phone for an SMS with a secure link to track this order at any time.",
        trackBtn: "Track My Order"
      },
      card: { deliveredIn: "Delivered in", aFewDays: "a few days", orderBtn: "Order This Phone" },
      js: {
        noPhones: "No phones available right now \u2014 check back soon.",
        loadError: "Couldn't load phones right now. Please refresh the page.",
        enterName: "Please enter your name.",
        invalidPhone: "Please enter a valid Kenyan phone number.",
        placingOrder: "Placing Order\u2026",
        networkError: "Network error. Please check your connection and try again.",
        orderPrefix: "Order",
        orderFor: "for"
      }
    },

    how: {
      pageTitle: "How Escrow Protection Works",
      pageSubtitle: "A straightforward process designed for security and transparency",
      step1Title: "Agreement Establishment",
      step1Desc: "Buyer and seller define the transaction terms: item description, price, delivery method, and timeline. Both parties accept the escrow terms.",
      step1Detail1: "Clear specification of goods or services",
      step1Detail2: "Mutually agreed delivery conditions",
      step1Detail3: "Inspection period definition",
      step2Title: "Buyer Funds Deposit",
      step2Desc: "Buyer transfers the agreed amount plus service fee to SecureEscrow's protected trust account. We verify receipt and notify the seller to proceed.",
      step2Detail1: "Multiple payment options including M\u2011PESA",
      step2Detail2: "Immediate verification of funds received",
      step2Detail3: "Seller notification to begin fulfillment",
      step3Title: "Seller Fulfillment",
      step3Desc: "Seller delivers the product or completes the service as agreed. For physical goods, tracking information is provided.",
      step3Detail1: "Shipment tracking integration",
      step3Detail2: "Delivery confirmation required",
      step3Detail3: "Inspection period begins",
      step4Title: "Buyer Inspection and Release",
      step4Desc: "Buyer examines the item or completed service. Upon satisfaction, buyer authorizes release of funds to the seller.",
      step4Detail1: "Defined inspection period (typically 48 hours)",
      step4Detail2: "Option to accept or raise concerns",
      step4Detail3: "Funds released within 24 hours of approval",
      ctaTitle: "Ready to transact with confidence?",
      ctaDesc: "Start your first protected transaction today",
      ctaBtn: "Begin Escrow Agreement"
    },

    about: {
      pageTitle: "About SecureEscrow Kenya",
      intro: "Founded in 2026, SecureEscrow Kenya addresses the trust deficit in online transactions across the country. We provide a neutral, regulated platform that protects both buyers and sellers.",
      purposeHeading: "Our Purpose",
      purposeText: "The growth of e\u2011commerce and online classifieds in Kenya has created new opportunities but also new risks. We exist to eliminate the uncertainty in transactions between strangers, ensuring that funds are only released when both parties fulfill their obligations.",
      complianceHeading: "Regulatory Compliance",
      complianceText: "SecureEscrow Kenya operates in full compliance with Kenyan financial regulations. All client funds are maintained in segregated trust accounts with licensed commercial banks, completely separate from our operating accounts.",
      feature1Title: "Licensed Operation",
      feature1Desc: "Registered and regulated under Kenyan commercial law",
      feature2Title: "Bank Partnerships",
      feature2Desc: "Trust accounts held with major Kenyan financial institutions",
      feature3Title: "M\u2011PESA Integration",
      feature3Desc: "Official Safaricom partner for mobile money transactions",
      feature4Title: "Continuous Support",
      feature4Desc: "Local customer service team available daily",
      stat1Label: "Protected Users",
      stat2Label: "Secured Volume",
      stat3Label: "Resolution Rate",
      stat4Label: "Average Release"
    },

    contact: {
      pageTitle: "Contact Our Team",
      pageSubtitle: "Support available for all your escrow inquiries",
      directHeading: "Direct Communication",
      hqTitle: "Nairobi Headquarters",
      hqDetail: "Westlands Business Centre<br>7th Floor, Wing B<br>Nairobi, Kenya",
      phoneTitle: "Telephone Support",
      emailTitle: "Email Correspondence",
      emailDetail: "General: info@securescrowkenya.com<br>Support: support@securescrowkenya.com",
      hoursTitle: "Business Hours",
      hoursDetail: "Monday \u2013 Friday: 8:00 AM \u2013 8:00 PM<br>Saturday: 9:00 AM \u2013 5:00 PM<br>Sunday: Emergency Support Only",
      formHeading: "Send a Message",
      nameLabel: "Full Name",
      emailLabel: "Email Address",
      phoneLabel: "Phone Number (Optional)",
      categoryLabel: "Inquiry Category",
      categorySelect: "Select category",
      categoryGeneral: "General Question",
      categorySupport: "Transaction Support",
      categoryDispute: "Dispute Resolution",
      categoryBusiness: "Business Partnership",
      messageLabel: "Your Message",
      submitBtn: "Submit Inquiry",
      formNote: "Response within 2 hours during business hours"
    },

    track: {
      pageTitle: "Track Your Transaction",
      pageSubtitle: "Enter your transaction reference or registered phone number",
      tabId: "Transaction ID",
      tabPhone: "Phone Number",
      idPlaceholder: "e.g. ESC-ABC123",
      trackBtn: "Track",
      idHint: "Enter the transaction reference provided at initiation.",
      findBtn: "Find",
      phoneHint: "Enter the buyer or seller phone number to locate transactions.",
      verifyTitle: "Verify Your Identity",
      verifyDesc: "Enter your phone number to verify you are the buyer or seller.",
      verifyPlaceholder: "Your phone number",
      verifyBtn: "Verify",
      verifyHint: "This helps us show you the correct actions for this transaction.",
      payoutTitle: "Payout Settings",
      payoutDesc: "Choose where your funds will be sent after buyer confirmation.",
      payoutMpesa: "M\u2011PESA (Phone Number)",
      payoutTill: "Till Number",
      payoutPaybill: "Paybill Number",
      payoutNumberLabel: "Till / Paybill Number",
      payoutNumberPlaceholder: "Enter Till or Paybill number",
      payoutAccountLabel: "Account Number (for Paybill)",
      payoutAccountPlaceholder: "Enter account number",
      payoutSaveBtn: "Save Payout Method",
      payoutHint: "Default is M\u2011PESA to your registered phone number."
    },

    legal: {
      tosTitle: "Terms of Service",
      privacyTitle: "Privacy Policy",
      escrowTitle: "Escrow Agreement",
      complianceTitle: "Regulatory Compliance",
      pendingNotice: "" // not shown in English
    }
  },

  sw: {
    common: {
      nav: {
        home: "Nyumbani",
        import: "Agiza Simu",
        how: "Jinsi Inavyofanya Kazi",
        track: "Fuatilia Muamala",
        about: "Kuhusu Sisi",
        contact: "Wasiliana Nasi",
        startTransaction: "Anza Muamala"
      },
      footer: {
        brandHeading: "SecureEscrow Kenya",
        tagline: "Tunalinda miamala ya mtandaoni ya Wakenya kupitia usimamizi wa mtu wa tatu unaoaminika tangu 2026.",
        badge: "Imesajiliwa na Kudhibitiwa Kisheria",
        quickAccess: "Ufikiaji wa Haraka",
        resources: "Rasilimali",
        legal: "Kisheria",
        helpCenter: "Kituo cha Msaada",
        dispute: "Utatuzi wa Migogoro",
        feeStructure: "Muundo wa Ada",
        transactionSafety: "Usalama wa Muamala",
        tos: "Masharti ya Huduma",
        privacy: "Sera ya Faragha",
        escrowAgreement: "Mkataba wa Escrow",
        compliance: "Uzingatiaji wa Sheria",
        copyright: "\u00A9 2026 SecureEscrow Kenya Limited. Haki zote zimehifadhiwa."
      },
      ticker: { title: "Shughuli za Escrow za Sasa Hivi Kenya" },
      loader: {
        tagline: "Tunalinda Muamala Wako",
        initializing: "Inaandaa mazingira salama\u2026"
      },
      trustStrip: {
        main: "Malipo Yanatolewa Papo Hapo Baada ya Uthibitisho wa Uwasilishaji",
        sub: "Malipo ya Haraka na Otomatiki"
      }
    },

    home: {
      hero: {
        titleLine1: "Linda Miamala Yako ya Mtandaoni",
        titleHighlight: "Kenya",
        description: "Linda fedha zako unaponunua au kuuza mtandaoni. Fedha huhifadhiwa salama katika escrow hadi uthibitishe uwasilishaji na uridhike.",
        ctaPrimary: "Anza Muamala wa Escrow",
        ctaSecondary: "Jifunze Jinsi Inavyofanya Kazi",
        metricSecured: "Zilizolindwa (KES)",
        metricUsers: "Watumiaji Hai",
        metricFraud: "Kiwango cha Udanganyifu"
      },
      form: {
        title: "Anzisha Mkataba wa Escrow",
        categoryLabel: "Aina ya Muamala",
        categorySelect: "Chagua aina",
        categoryProduct: "Bidhaa Halisi",
        categoryDigital: "Bidhaa ya Kidijitali",
        categoryService: "Huduma ya Kitaalamu",
        categoryVehicle: "Ununuzi wa Gari",
        itemLabel: "Maelezo ya Bidhaa au Huduma",
        itemPlaceholder: "mfano: Samsung Galaxy S24 Ultra",
        detailsLabel: "Maelezo Zaidi",
        detailsPlaceholder: "Jumuisha masharti mahususi, nambari za modeli, au vitu vitakavyowasilishwa",
        amountLabel: "Kiasi (KES)",
        amountPlaceholder: "Weka kiasi",
        buyerContactLabel: "Mawasiliano Yako",
        buyerContactPlaceholder: "Nambari yako ya M-PESA",
        sellerContactLabel: "Mawasiliano ya Muuzaji",
        sellerContactPlaceholder: "Nambari ya simu ya muuzaji",
        payoutTypeLabel: "Njia ya Malipo ya Muuzaji",
        payoutMpesa: "M-PESA (Nambari ya Simu)",
        payoutTill: "Nambari ya Till",
        payoutPaybill: "Nambari ya Paybill",
        payoutNumberLabel: "Nambari ya Till / Paybill",
        payoutNumberPlaceholder: "Weka nambari ya Till au Paybill",
        payoutAccountLabel: "Nambari ya Akaunti (kwa Paybill)",
        payoutAccountPlaceholder: "Weka nambari ya akaunti",
        deadlineLabel: "Muda wa Mwisho wa Uwasilishaji",
        transactionAmount: "Kiasi cha Muamala",
        totalPayment: "Jumla ya Malipo",
        continueBtn: "Endelea kwa Maelezo ya Malipo",
        disclaimer: "Fedha zako zinahifadhiwa kwa usalama na hutolewa tu baada ya uthibitisho wako"
      },
      trust: {
        title: "Kwa Nini Biashara Zinachagua SecureEscrow",
        subtitle: "Ulinzi wa miamala unaotegemewa zaidi Kenya kupitia mtu wa tatu",
        card1Title: "Ulinzi wa Fedha",
        card1Desc: "Fedha zote huhifadhiwa katika akaunti maalum za amana na taasisi za kifedha za Kenya zilizosajiliwa.",
        card2Title: "Mchakato Uliothibitishwa",
        card2Desc: "Kila muamala hufuatiliwa na timu yetu ya uzingatiaji sheria ili kuhakikisha matokeo ya haki.",
        card3Title: "Utatuzi wa Migogoro",
        card3Desc: "Usuluhishi wa upande wowote unapatikana iwapo mnunuzi na muuzaji hawawezi kufikia makubaliano.",
        card4Title: "Malipo ya Haraka",
        card4Desc: "Fedha hutolewa kwa muuzaji ndani ya saa 24 baada ya uthibitisho wa mnunuzi."
      },
      partners: { label: "Inaaminiwa na Biashara Kuu za Kenya" }
    },

    import: {
      trust: {
        main: "Imeagizwa na Kuwasilishwa na SecureEscrow \u2014 Si Mtu wa Tatu",
        sub: "Bei Moja. Jukumu Kamili, Kutoka Marekani hadi Kenya."
      },
      hero: {
        title: "Agiza Simu",
        subtitle: "SecureEscrow inatafuta, kuagiza na kuwasilisha simu hizi moja kwa moja kwako \u2014 tunawajibika kwa kifaa chako kuanzia ununuzi Marekani hadi mlangoni kwako Kenya. Bei unayoiona ndiyo bei unayolipa, ikihifadhiwa salama katika escrow hadi uthibitishe uwasilishaji."
      },
      loading: "Inapakia simu zilizopo\u2026",
      how: {
        title: "Jinsi Agizo la Kuagiza Linavyofanya Kazi",
        subtitle: "SecureEscrow ndiye anayeagiza, kusafirisha na kushughulikia kifaa chako \u2014 mwanzo hadi mwisho",
        step1Title: "Unaagiza na Kulipa Kupitia Escrow",
        step1Desc: "Chagua simu na ulipe bei iliyoorodheshwa. Fedha zako huingia kwenye akaunti ya amana iliyolindwa ya SecureEscrow \u2014 si kwa mtu mwingine yeyote.",
        step2Title: "SecureEscrow Inatafuta na Kuagiza",
        step2Desc: "Sisi wenyewe tunanunua, kusafirisha na kupitisha forodha kwa kifaa chako. SecureEscrow anawajibika nacho kutoka Marekani hadi Kenya \u2014 utapata masasisho ya SMS kadri linavyoendelea.",
        step3Title: "Imewasilishwa Kwako",
        step3Desc: "Simu yako inawasilishwa kwenye anwani uliyotoa. Ikague kabla ya kuthibitisha.",
        step4Title: "Unathibitisha, Fedha Zinatolewa",
        step4Desc: "Umeridhika nayo? Thibitisha kupitia kiungo salama kilichotumwa kwenye simu yako na fedha zitatolewa. Hukuridhika? Fungua mgogoro badala yake \u2014 SecureEscrow inasimamia kifaa ilichokuagizia."
      },
      modal: {
        title: "Agiza Simu Hii",
        nameLabel: "Jina Lako",
        namePlaceholder: "Jina kamili",
        phoneLabel: "Nambari Yako ya M-PESA",
        cityLabel: "Mji / Eneo",
        cityPlaceholder: "mfano: Kisumu",
        addressLabel: "Anwani ya Uwasilishaji",
        addressPlaceholder: "Estate, alama, au sehemu ya kuchukulia kutoka kwa kampuni ya usafirishaji",
        notesLabel: "Maelezo (hiari)",
        notesPlaceholder: "Chochote tunachopaswa kujua kuhusu agizo lako",
        totalPayment: "Jumla ya Malipo",
        confirmBtn: "Thibitisha na Lipa Kupitia Escrow",
        disclaimer: "Malipo yako yanahifadhiwa kwa usalama na hutolewa kwetu tu baada ya kuthibitisha uwasilishaji.",
        successTitle: "Agizo Limewekwa",
        successText: "Angalia simu yako kwa ujumbe wa SMS wenye kiungo salama cha kufuatilia agizo hili wakati wowote.",
        trackBtn: "Fuatilia Agizo Langu"
      },
      card: { deliveredIn: "Uwasilishaji ndani ya", aFewDays: "siku chache", orderBtn: "Agiza Simu Hii" },
      js: {
        noPhones: "Hakuna simu zinazopatikana kwa sasa \u2014 rudi baadaye.",
        loadError: "Imeshindwa kupakia simu kwa sasa. Tafadhali onyesha upya ukurasa.",
        enterName: "Tafadhali weka jina lako.",
        invalidPhone: "Tafadhali weka nambari sahihi ya simu ya Kenya.",
        placingOrder: "Inaweka Agizo\u2026",
        networkError: "Hitilafu ya mtandao. Tafadhali angalia muunganisho wako na ujaribu tena.",
        orderPrefix: "Agizo",
        orderFor: "la"
      }
    },

    how: {
      pageTitle: "Jinsi Ulinzi wa Escrow Unavyofanya Kazi",
      pageSubtitle: "Mchakato rahisi ulioundwa kwa usalama na uwazi",
      step1Title: "Kuanzisha Makubaliano",
      step1Desc: "Mnunuzi na muuzaji wanabainisha masharti ya muamala: maelezo ya bidhaa, bei, njia ya uwasilishaji, na muda. Pande zote mbili zinakubali masharti ya escrow.",
      step1Detail1: "Ubainisho wazi wa bidhaa au huduma",
      step1Detail2: "Masharti ya uwasilishaji yaliyokubaliwa na pande zote",
      step1Detail3: "Ubainisho wa muda wa ukaguzi",
      step2Title: "Mnunuzi Anaweka Fedha",
      step2Desc: "Mnunuzi anahamisha kiasi kilichokubaliwa pamoja na ada ya huduma kwenye akaunti ya amana iliyolindwa ya SecureEscrow. Tunathibitisha upokeaji na kumjulisha muuzaji aendelee.",
      step2Detail1: "Njia mbalimbali za malipo ikiwemo M\u2011PESA",
      step2Detail2: "Uthibitisho wa haraka wa fedha zilizopokelewa",
      step2Detail3: "Muuzaji anajulishwa kuanza kutimiza wajibu",
      step3Title: "Muuzaji Anatimiza Wajibu",
      step3Desc: "Muuzaji anawasilisha bidhaa au kukamilisha huduma kama ilivyokubaliwa. Kwa bidhaa halisi, maelezo ya ufuatiliaji hutolewa.",
      step3Detail1: "Uunganishaji wa ufuatiliaji wa usafirishaji",
      step3Detail2: "Uthibitisho wa uwasilishaji unahitajika",
      step3Detail3: "Muda wa ukaguzi unaanza",
      step4Title: "Mnunuzi Anakagua na Kutoa Fedha",
      step4Desc: "Mnunuzi anachunguza bidhaa au huduma iliyokamilika. Akiridhika, mnunuzi anaidhinisha kutolewa kwa fedha kwa muuzaji.",
      step4Detail1: "Muda maalum wa ukaguzi (kawaida saa 48)",
      step4Detail2: "Chaguo la kukubali au kuibua wasiwasi",
      step4Detail3: "Fedha hutolewa ndani ya saa 24 baada ya idhini",
      ctaTitle: "Uko tayari kufanya muamala kwa ujasiri?",
      ctaDesc: "Anza muamala wako wa kwanza uliolindwa leo",
      ctaBtn: "Anza Mkataba wa Escrow"
    },

    about: {
      pageTitle: "Kuhusu SecureEscrow Kenya",
      intro: "Ilianzishwa mwaka 2026, SecureEscrow Kenya inashughulikia upungufu wa uaminifu katika miamala ya mtandaoni nchini kote. Tunatoa jukwaa lisilo na upendeleo, lililodhibitiwa kisheria linalolinda wanunuzi na wauzaji wote wawili.",
      purposeHeading: "Kusudi Letu",
      purposeText: "Ukuaji wa biashara ya mtandaoni na matangazo ya uainishaji nchini Kenya umeleta fursa mpya lakini pia hatari mpya. Tupo ili kuondoa mashaka katika miamala baina ya watu wasiofahamiana, kuhakikisha fedha hutolewa tu wakati pande zote mbili zimetimiza wajibu wao.",
      complianceHeading: "Uzingatiaji wa Kanuni",
      complianceText: "SecureEscrow Kenya inafanya kazi kwa kuzingatia kikamilifu kanuni za kifedha za Kenya. Fedha zote za wateja huhifadhiwa katika akaunti maalum za amana na benki za kibiashara zilizosajiliwa, tofauti kabisa na akaunti zetu za uendeshaji.",
      feature1Title: "Uendeshaji Ulioidhinishwa",
      feature1Desc: "Imesajiliwa na kudhibitiwa chini ya sheria za kibiashara za Kenya",
      feature2Title: "Ushirikiano na Benki",
      feature2Desc: "Akaunti za amana zinashikiliwa na taasisi kuu za kifedha za Kenya",
      feature3Title: "Muunganiko wa M\u2011PESA",
      feature3Desc: "Mshirika rasmi wa Safaricom kwa miamala ya fedha za simu",
      feature4Title: "Msaada wa Kudumu",
      feature4Desc: "Timu ya huduma kwa wateja ya ndani inapatikana kila siku",
      stat1Label: "Watumiaji Waliolindwa",
      stat2Label: "Kiasi Kilicholindwa",
      stat3Label: "Kiwango cha Utatuzi",
      stat4Label: "Wastani wa Kutolewa"
    },

    contact: {
      pageTitle: "Wasiliana na Timu Yetu",
      pageSubtitle: "Msaada unapatikana kwa maswali yako yote ya escrow",
      directHeading: "Mawasiliano ya Moja kwa Moja",
      hqTitle: "Makao Makuu ya Nairobi",
      hqDetail: "Westlands Business Centre<br>Ghorofa ya 7, Wing B<br>Nairobi, Kenya",
      phoneTitle: "Msaada wa Simu",
      emailTitle: "Mawasiliano ya Barua Pepe",
      emailDetail: "Jumla: info@securescrowkenya.com<br>Msaada: support@securescrowkenya.com",
      hoursTitle: "Saa za Kazi",
      hoursDetail: "Jumatatu \u2013 Ijumaa: 8:00 AM \u2013 8:00 PM<br>Jumamosi: 9:00 AM \u2013 5:00 PM<br>Jumapili: Msaada wa Dharura Pekee",
      formHeading: "Tuma Ujumbe",
      nameLabel: "Jina Kamili",
      emailLabel: "Anwani ya Barua Pepe",
      phoneLabel: "Nambari ya Simu (Si Lazima)",
      categoryLabel: "Aina ya Swali",
      categorySelect: "Chagua aina",
      categoryGeneral: "Swali la Jumla",
      categorySupport: "Msaada wa Muamala",
      categoryDispute: "Utatuzi wa Migogoro",
      categoryBusiness: "Ushirikiano wa Kibiashara",
      messageLabel: "Ujumbe Wako",
      submitBtn: "Wasilisha Swali",
      formNote: "Jibu ndani ya saa 2 wakati wa saa za kazi"
    },

    track: {
      pageTitle: "Fuatilia Muamala Wako",
      pageSubtitle: "Weka nambari ya rejea ya muamala wako au nambari ya simu iliyosajiliwa",
      tabId: "Nambari ya Muamala",
      tabPhone: "Nambari ya Simu",
      idPlaceholder: "mfano: ESC-ABC123",
      trackBtn: "Fuatilia",
      idHint: "Weka nambari ya rejea ya muamala iliyotolewa mwanzoni.",
      findBtn: "Tafuta",
      phoneHint: "Weka nambari ya simu ya mnunuzi au muuzaji ili kupata miamala.",
      verifyTitle: "Thibitisha Utambulisho Wako",
      verifyDesc: "Weka nambari yako ya simu kuthibitisha kuwa wewe ni mnunuzi au muuzaji.",
      verifyPlaceholder: "Nambari yako ya simu",
      verifyBtn: "Thibitisha",
      verifyHint: "Hii inatusaidia kukuonyesha hatua sahihi za muamala huu.",
      payoutTitle: "Mipangilio ya Malipo",
      payoutDesc: "Chagua mahali fedha zako zitakapotumwa baada ya uthibitisho wa mnunuzi.",
      payoutMpesa: "M\u2011PESA (Nambari ya Simu)",
      payoutTill: "Nambari ya Till",
      payoutPaybill: "Nambari ya Paybill",
      payoutNumberLabel: "Nambari ya Till / Paybill",
      payoutNumberPlaceholder: "Weka nambari ya Till au Paybill",
      payoutAccountLabel: "Nambari ya Akaunti (kwa Paybill)",
      payoutAccountPlaceholder: "Weka nambari ya akaunti",
      payoutSaveBtn: "Hifadhi Njia ya Malipo",
      payoutHint: "Chaguo-msingi ni M\u2011PESA kwa nambari yako ya simu iliyosajiliwa."
    },

    legal: {
      tosTitle: "Masharti ya Huduma",
      privacyTitle: "Sera ya Faragha",
      escrowTitle: "Mkataba wa Escrow",
      complianceTitle: "Uzingatiaji wa Kanuni",
      pendingNotice: "Tafsiri kamili ya Kiswahili ya maandishi haya ya kisheria bado inaandaliwa na inasubiri ukaguzi wa kitaalamu. Toleo la Kiingereza hapa chini ndilo linalotumika kisheria kwa sasa."
    }
  }
};