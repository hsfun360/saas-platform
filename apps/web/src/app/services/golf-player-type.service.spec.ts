import { playerTypeBase, playerTypeNeedsGuestName, playerTypeIsHostedGuest, playerTypeLabel, GolfPlayerTypeOption } from './golf-player-type.service';

// The six engine classes (2026-11-13): the screens decide "member number or
// name" and "needs a host member" by the base identity, never by the code.
describe('golf player type helpers', () => {
  const types: GolfPlayerTypeOption[] = [
    { key: 'member', label: 'Member', baseIdentity: 'member' },
    { key: 'member-guest', label: 'Member as Guest', baseIdentity: 'member-guest' },
    { key: 'guest', label: 'Guest', baseIdentity: 'guest' },
    { key: 'visitor', label: 'Visitor', baseIdentity: 'visitor' },
    { key: 'MGA', label: 'MGA affiliate', baseIdentity: 'affiliate' },
    { key: 'RECIP', label: 'Reciprocal club', baseIdentity: 'reciprocal' },
    { key: 'HOTEL', label: 'Hotel guest', baseIdentity: 'guest' },
  ];

  it('resolves a code to its base identity and an unknown code to itself', () => {
    expect(playerTypeBase(types, 'HOTEL')).toBe('guest');
    expect(playerTypeBase(types, 'RECIP')).toBe('reciprocal');
    expect(playerTypeBase([], 'visitor')).toBe('visitor');
    expect(playerTypeBase(null, 'member')).toBe('member');
  });

  it('asks for a name on guest, visitor and club-visitor types, a member number on the member classes', () => {
    for (const code of ['guest', 'visitor', 'MGA', 'RECIP', 'HOTEL']) expect(playerTypeNeedsGuestName(types, code)).toBe(true);
    for (const code of ['member', 'member-guest']) expect(playerTypeNeedsGuestName(types, code)).toBe(false);
  });

  it('treats only a guest and a member-as-guest as a member\'s guest (a host is needed); a visitor has no host', () => {
    expect(playerTypeIsHostedGuest(types, 'guest')).toBe(true);
    expect(playerTypeIsHostedGuest(types, 'HOTEL')).toBe(true);
    expect(playerTypeIsHostedGuest(types, 'member-guest')).toBe(true);
    expect(playerTypeIsHostedGuest(types, 'visitor')).toBe(false);
    expect(playerTypeIsHostedGuest(types, 'MGA')).toBe(false);
    expect(playerTypeIsHostedGuest(types, 'RECIP')).toBe(false);
    expect(playerTypeIsHostedGuest(types, 'member')).toBe(false);
  });

  it('labels a code by the club\'s description and falls back to the code', () => {
    expect(playerTypeLabel(types, 'visitor')).toBe('Visitor');
    expect(playerTypeLabel(types, 'ZZZ')).toBe('ZZZ');
  });
});
