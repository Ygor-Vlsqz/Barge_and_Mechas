export const MECHS = {
  juggler: {
    id: "juggler",
    name: "Juggler",
    image: "./Juggler.png",

    corpseAttractionMultiplier: 2,
    maxCarriedCorpses: 4,
    fireRateMultiplier(carriedCorpses = 0) {
      const count = Math.max(0, Math.min(4, carriedCorpses));
      return 1 - count * 0.25;
    },

    canClimb: true,
    ignoresDifficultTerrain: true,

    specials: {
      1: {
        id: "raise_ground",
        name: "Erguer o chão",
        target: "mouse",
        effect: "Cria um bloco de terra na posição do mouse.",
        destroyedBy: "projectiles"
      },
      2: {
        id: "pull_or_push_enemies",
        name: "Atração e repulsão",
        target: "mouse",
        holdToRepel: true,
        mobileTarget: "point_in_front_of_mech",
        effect: "Atrai inimigos para o alvo; ao segurar a habilidade, repele-os."
      }
    }
  },

  roamer: {
    id: "roamer",
    name: "Roamer",
    image: "./Roamer.png",

    movement: {
      flies: true,
      fastInStraightLines: true,
      slowInTurns: true
    },

    specials: {
      1: {
        id: "diving_attack",
        name: "Rasante",
        target: "direction",
        effect: "Avança em uma direção, afasta inimigos para os lados e causa dano."
      },
      2: {
        id: "capture_or_throw",
        name: "Capturar / arremessar",
        effect: "Captura e desabilita um inimigo vivo; ao usar novamente, arremessa-o para longe."
      }
    }
  },

  skipper: {
    id: "skipper",
    name: "Skipper",
    image: "./Skipper.png",

    weapon: {
      ignoresCover: true
    },

    specials: {
      1: {
        id: "jump_and_slam",
        name: "Salto de impacto",
        effect: "Salta e causa dano na área onde pousa."
      },
      2: {
        id: "high_damage_laser",
        name: "Laser",
        effect: "Dispara um laser de alto dano."
      }
    }
  },

  watcher: {
    id: "watcher",
    name: "Watcher",
    image: "./Watcher.png",

    movement: {
      type: "normal"
    },

    specials: {
      1: {
        id: "bomb_to_mines",
        name: "Bomba de minas",
        effect: "Lança uma bomba que se divide em quatro minas terrestres."
      },
      2: {
        id: "heat_and_heal",
        name: "Liberação de calor",
        effect: "Libera calor ao redor do mecha e recupera a própria vida."
      }
    }
  }
};

export function getMech(mechId) {
  return MECHS[mechId] ?? null;
}
