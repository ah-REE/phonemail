/**
 * The IVR phone tree, as a PURE function.
 *
 * Twilio makes a NEW HTTP request for every menu step, so the call's state cannot
 * live in a server variable: it travels in the `action` URL's query params, and the
 * server stays stateless. That makes the whole flow a decision about
 * (stage, digits, attempts) -> TwiML, which is exactly what this module is - no
 * database, no Request, no environment.
 *
 * The route (src/app/api/ivr/signup/route.ts) keeps the three things that are NOT
 * pure: verifying the shared token, reading the caller's number out of whatever the
 * provider sent, and performing the ONE side effect - the idempotent account upsert
 * that registration asks for. The plan says `register: true`; the route does it.
 *
 * WHY TAMIL ENDS IN ENGLISH: Twilio's TTS has no Tamil voice, and the app ships
 * English only. Rather than pretend (or drop the caller), pressing 2 says so and
 * continues in English - the honest, consistent handling.
 */

export const IVR_REPLAY_LIMIT = 2;

export interface IvrState {
  /** "lang" | "main" | anything else (which restarts the greeting). */
  stage: string | null;
  /** Twilio sends Digits; Exotel spells it differently, and the route normalises. */
  digits: string | null;
  /** "en" for now; carried so the menu can greet in the chosen language. */
  lang: string | null;
  /** How many times THIS stage has already been replayed (0 on first entry). */
  attempts: number;
  /** The caller's number, already normalised to 10 digits. */
  callerPhone: string;
  /** The shared token, to be carried through every action URL unchanged. */
  token: string;
}

export interface IvrPlan {
  /** The complete TwiML document to answer with. */
  xml: string;
  status: number;
  /** True when the caller asked to register: the ROUTE performs the upsert. */
  register: boolean;
  /** True when the call ends here. */
  hangup: boolean;
}

/** TwiML is XML: a Say with an ampersand in it must not break the document. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "9876543210" -> "9 8 7 6 5 4 3 2 1 0", so a TTS voice reads it digit by digit. */
export function spokenDigits(phone: string): string {
  return phone.split("").join(" ");
}

function document(body: string, status = 200): IvrPlan {
  return {
    xml: `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${body}\n</Response>`,
    status,
    register: false,
    hangup: false,
  };
}

/** The action URL for a Gather: the token and the state ride in the query. */
function actionUrl(stage: string, state: IvrState, attempts: number): string {
  const params = new URLSearchParams({
    token: state.token,
    stage,
    lang: state.lang ?? "en",
    attempts: String(attempts),
  });
  return `/api/ivr/signup?${params.toString()}`;
}

function gather(action: string, say: string, voice = "woman"): string {
  return `  <Gather action="${escapeXml(action)}" numDigits="1">\n    <Say voice="${voice}">${escapeXml(say)}</Say>\n  </Gather>`;
}

/** STEP 1: the language menu, which is also where every restart begins. */
export function languageMenu(state: IvrState, attempts = 0): IvrPlan {
  return document(
    gather(
      actionUrl("lang", state, attempts),
      "Welcome to PhoneMail. Choose your language. For English, press 1. For Tamil, press 2.",
    ),
  );
}

/** STEP 2's main menu. */
export function mainMenu(state: IvrState, attempts = 0): IvrPlan {
  return document(
    gather(
      actionUrl("main", state, attempts),
      "To know about PhoneMail, press 3. To register for PhoneMail, press 4.",
    ),
  );
}

function goodbye(state: IvrState): IvrPlan {
  const plan = document(
    `  <Say voice="woman">${escapeXml("Sorry, we could not understand that. Thank you for calling PhoneMail. Goodbye.")}</Say>\n  <Hangup/>`,
  );
  return { ...plan, hangup: true };
}

/** What pressing 4 ends with, once the route has created the account. */
export function successPlan(state: IvrState): IvrPlan {
  const plan = document(
    `  <Say voice="woman">${escapeXml(
      `Congratulations! Your registration is successful. Your email address is ${spokenDigits(
        state.callerPhone,
      )} at phonemail dot com. Thank you for choosing PhoneMail.`,
    )}</Say>\n  <Hangup/>`,
  );
  return { ...plan, register: true, hangup: true };
}

/** The one-shot Exotel path, unchanged: press 1 and the account is ready. */
export function oneShotPlan(state: IvrState): IvrPlan {
  const plan = document(
    `  <Say voice="woman">${escapeXml(
      "Your PhoneMail account is ready. You can send and receive messages now.",
    )}</Say>`,
  );
  return { ...plan, register: true };
}

/**
 * The whole tree. Every branch is here, and nothing in it touches the world.
 */
export function planIvrResponse(state: IvrState): IvrPlan {
  // Unknown stage (a stale URL, a hand-crafted one): start over with a greeting
  // rather than failing - the caller hears something sensible either way.
  if (state.stage !== "lang" && state.stage !== "main") {
    return languageMenu(state);
  }

  const digits = state.digits ?? "";
  const attempts = Number.isFinite(state.attempts) && state.attempts > 0 ? state.attempts : 0;

  if (state.stage === "lang") {
    if (digits === "1") {
      return mainMenu({ ...state, lang: "en" });
    }
    if (digits === "2") {
      // Honest, consistent, and it keeps the caller on the line.
      const tamil = document(
        gather(
          actionUrl("main", { ...state, lang: "en" }, 0),
          "Tamil is coming soon. Continuing in English. To know about PhoneMail, press 3. To register for PhoneMail, press 4.",
        ),
      );
      return tamil;
    }
    return attempts >= IVR_REPLAY_LIMIT ? goodbye(state) : languageMenu(state, attempts + 1);
  }

  // stage === "main"
  if (digits === "3") {
    // The description, then straight back to the menu so they can press 4.
    return document(
      gather(
        actionUrl("main", state, 0),
        "PhoneMail turns your phone number into an email address. Your ten digit phone number, at phonemail dot com, is your email. Messages arrive as simple chats, just like your messaging apps. To register now, press 4.",
      ),
    );
  }
  if (digits === "4") {
    return successPlan(state);
  }
  return attempts >= IVR_REPLAY_LIMIT ? goodbye(state) : mainMenu(state, attempts + 1);
}
