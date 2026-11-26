export const services = {
  membership: 'Membership',
  personalTraining: 'Personal Training',
  pilates: 'Pilates Performer',
} as const;

export type Service = keyof typeof services;

type ClubContact = {
  name: string;
  phone: string;
  active: boolean;
  services: readonly Service[];
};

// Populate only from the approved Marketing workbook.
export const clubContacts: readonly ClubContact[] = [];

export function normalizePhone(phone: string) {
  const compact = phone.trim().replace(/[\s()-]/g, '');
  const international = compact.startsWith('0') ? `62${compact.slice(1)}` : compact.replace(/^\+/, '');
  return /^628\d{7,12}$/.test(international) ? international : null;
}

export function eligibleClubs(service: Service, contacts = clubContacts) {
  return contacts.filter(club => club.active && club.services.includes(service) && normalizePhone(club.phone));
}

export function whatsappUrl(club: ClubContact, service: Service) {
  const phone = normalizePhone(club.phone);
  if (!phone || !club.active || !club.services.includes(service)) return null;

  const message = `Halo RED FITNESS ${club.name}, saya ingin mendapatkan informasi mengenai ${services[service]}.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
