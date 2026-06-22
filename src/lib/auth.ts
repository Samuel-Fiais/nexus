export interface DemoUser {
  id: string;
  email: string;
  name: string;
}

export function authorizeDemoEmail(email: string): DemoUser | null {
  if (!email.includes("@")) {
    return null;
  }

  return {
    id: "1",
    email,
    name: email.split("@")[0] ?? email,
  };
}
