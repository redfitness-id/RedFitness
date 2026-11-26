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

// Marketing workbook, WhatsApp per Klub. Confirm the example-labeled Taman Palem row before production.
export const clubContacts: readonly ClubContact[] = [
  { name: 'Taman Palem', phone: '0877 177 177 31', active: true, services: ['membership', 'personalTraining'] },
  { name: 'Bogor', phone: '0877 177 177 35', active: true, services: ['membership', 'personalTraining'] },
  { name: 'Kramat Jati', phone: '0877 177 177 60', active: true, services: ['membership', 'personalTraining'] },
  { name: 'Cileungsi', phone: '0877 177 177 43', active: true, services: ['membership', 'personalTraining', 'pilates'] },
  { name: 'Tambun', phone: '0877 177 177 02', active: true, services: ['membership', 'personalTraining'] },
  { name: 'Citra 8 JKT', phone: '0817 177 177 06', active: true, services: ['membership', 'personalTraining', 'pilates'] },
  { name: 'Green Pramuka Square', phone: '0877 177 177 85', active: true, services: ['membership', 'personalTraining', 'pilates'] },
  { name: 'Graha Raya Bintaro', phone: '0878 177 177 38', active: true, services: ['membership', 'personalTraining', 'pilates'] },
];

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
