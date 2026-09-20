const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Golf booking DETAIL - one row per player of a booking (the 2006 screen's
// Member vs Guest / Member-as-Guest split). Members and members-as-guests
// resolve to a golf.Golfer identity; a plain guest may be NAME-ONLY at
// booking (even just "Guest") - golferId stays NULL and the durable
// OtherGolfer profile is created/matched at front-desk registration (user
// decision 2026-09-20). Guest control validates playerType against the
// resolved rule at save. Rows cascade with their booking header.
const BookingPlayer = sequelize.define('GolfBookingPlayer', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    bookingId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Player 1..n; player 1 is the booking maker.
    sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    // 'member' | 'member-guest' | 'guest' (booking.constants PLAYER_TYPE_KEYS).
    playerType: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // golf.Golfer identity - required for member/member-guest lines, NULL for
    // name-only guests (linked at registration).
    golferId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // Display snapshot: the member's name, or the keyed guest name.
    playerName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // Member number snapshot (member / member-guest lines).
    memberNo: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'BookingPlayer',
    timestamps: true,
    indexes: [
        { name: 'IX_GolfBookingPlayer_Booking', fields: ['bookingId'] },
    ],
});

module.exports = BookingPlayer;
