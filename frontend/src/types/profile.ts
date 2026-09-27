/** A row of `public.profiles`, keyed by the auth user's UUID. */
export interface Profile {
  id: string;
  display_name: string | null;
  username: string | null;
  bio: string | null;
  website: string | null;
  university: string | null;
  avatar_url: string | null;
}

/** The signed-in auth user, reduced to what the UI needs. */
export interface AccountUser {
  id: string;
  email: string | null;
  metadataDisplayName: string | null;
}

/** Editable profile fields, as entered in the Edit Profile form. */
export interface ProfileInput {
  display_name: string;
  username: string;
  bio: string;
  website: string;
  university: string;
}
