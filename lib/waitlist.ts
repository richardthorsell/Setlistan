// A name for the waitlist: letters (any language), spaces, dots, hyphens and apostrophes, 1-60 characters.
// The name is printed in the confirmation e-mail, so links and web addresses are refused (otherwise the form can be
// used to send arbitrary text from our sender address to anyone).
const NAME = /^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]{0,59}$/u;
const LOOKS_LIKE_LINK = /https?|www|\.\p{L}{2,}/iu;

export const validName = (s: string) => NAME.test(s) && !LOOKS_LIKE_LINK.test(s);
