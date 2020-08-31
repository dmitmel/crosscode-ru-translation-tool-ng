/* eslint-disable @typescript-eslint/no-explicit-any */

const { jsonPatches } = ccmod.resources;

jsonPatches.add('data/lang/sc/gui.en_US.json', (data: any) =>
  ig.merge(data, {
    labels: {
      'combat-hud': {
        'pvp-round': 'Round',
        boss: 'Boss',
      },
      'title-screen': {
        changelog: 'Changelog',
      },
      options: {
        'crosscode-ru': {
          'localized-labels-on-sprites': {
            name: 'Localized labels on sprites',
            description:
              'Enables translated labels on sprites such as signs in the game world. \\c[1]Needs a restart!',
          },
          // this option is untranslated because it doesn't make sense in other
          // locales, plus I can trick Localize Me into not running
          // `text_filter` (which corrects spelling of "Lea" literally
          // everywhere) on these string by patching them directly in the
          // original files
          'lea-spelling': {
            name: 'Перевод имени "Lea"',
            description:
              '\\c[3]Лея\\c[0]: Более естественно звучащий вариант. \\c[3]Лиа\\c[0]: Сохраняет каноническое произношение. \\c[1]Требуется перезапуск!',
            group: ['Лея', 'Лиа'],
          },
        },
      },
    },
  }),
);

jsonPatches.add(
  // sorry, Felix... not many people watch credits until the end, so I'll have
  // to inject our names in the first data file. hope RFG doesn't mind :P
  'data/credits/radicalfish-core.json',
  async (data: any) => {
    if (ig.currentLang !== 'ru_RU') return;

    let entries = Object.entries<any>(data.entries);

    let russianCreditsData: {
      entries: Record<string, any>;
    } = await ccmod.resources.loadJSON('data/credits/crosscode-ru.json');
    let russianEntries = Object.entries(russianCreditsData.entries);

    let felixIndex = entries.findIndex(
      ([key, _value]) => key === 'creativeDirector',
    );
    if (felixIndex >= 0) {
      // don't forget that `entries` here has type `Array<[K, V]>`
      entries[felixIndex][1].bottomPad = 80;
    }
    sc.ru.insertAfterOrAppend(entries, felixIndex, ...russianEntries);

    data.entries = sc.ru.objectFromEntries(entries);
  },
);

jsonPatches.add('data/scale-props/dungeon-ar.json', (data: any) => {
  if (!sc.ru.shouldPatchSpriteLabels()) return;

  data.jsonTEMPLATES.ArTextRu = {
    ...ig.copy(data.jsonTEMPLATES.ArText),
    gfx: 'media/entity/objects/dungeon-ar.ru_RU.png',
    gfxBaseX: 0,
    gfxBaseY: 0,
  };

  Object.assign(data.entries.textWelcome, {
    jsonINSTANCE: 'ArTextRu',
    srcX: 0,
    srcY: 16,
    width: 128,
  });
  Object.assign(data.entries.textComplete, {
    jsonINSTANCE: 'ArTextRu',
    srcX: 0,
    srcY: 32,
    width: 128,
  });
});

jsonPatches.add('data/scale-props/dungeon-ar-special.json', (data: any) => {
  if (!sc.ru.shouldPatchSpriteLabels()) return;

  data.jsonTEMPLATES.ArTextRu = {
    ...ig.copy(data.jsonTEMPLATES.ArText),
    gfx: 'media/entity/objects/dungeon-ar-special.ru_RU.png',
    gfxBaseX: 0,
    gfxBaseY: 0,
  };

  Object.assign(data.entries.textWait, {
    jsonINSTANCE: 'ArTextRu',
    srcX: 0,
    srcY: 16,
    width: 96,
  });
  Object.assign(data.entries.textLea, {
    jsonINSTANCE: 'ArTextRu',
    srcX: 0,
    srcY: 32,
    width: 144,
  });
});

jsonPatches.add('data/scale-props/trading-ar.json', (data: any) => {
  if (!sc.ru.shouldPatchSpriteLabels()) return;

  data.jsonTEMPLATES.ArTextRu = {
    ...ig.copy(data.jsonTEMPLATES.ArText),
    gfx: 'media/map/trading-autumn.ru_RU.png',
    gfxBaseX: 0,
    gfxBaseY: 0,
  };

  Object.assign(data.entries.textCups, {
    jsonINSTANCE: 'ArTextRu',
    srcX: 8,
    srcY: 0,
    width: 45,
  });
  Object.assign(data.entries.textInfo, {
    jsonINSTANCE: 'ArTextRu',
    srcX: 8,
    srcY: 12,
    width: 39,
  });
});

jsonPatches.add('data/scale-props/rhombus-sqr.json', (data: any) => {
  if (!sc.ru.shouldPatchSpriteLabels()) return;

  function patchProp(
    prop: any,
    { srcX, srcY, width }: { srcX: number; srcY: number; width: number },
  ): void {
    Object.assign(prop, {
      gfx: 'media/map/rhombus-sign.ru_RU.png',
      gfxBaseX: 0,
      gfxBaseY: 0,
    });
    Object.assign(prop.patterns, { x: srcX, y: srcY, w: width });
  }

  patchProp(data.entries.wallARweapon, {
    srcX: 63,
    srcY: 0,
    width: 64,
  });
  patchProp(data.entries.wallARcrosscentral, {
    srcX: 47,
    srcY: 16,
    width: 80,
  });
  patchProp(data.entries.wallARitem, {
    srcX: 71,
    srcY: 32,
    width: 56,
  });
  patchProp(data.entries.wallARbooster, {
    srcX: 71,
    srcY: 48,
    width: 56,
  });
  patchProp(data.entries.wallARarena, {
    srcX: 15,
    srcY: 32,
    width: 56,
  });
  patchProp(data.entries.wallARcurios, {
    srcX: 13,
    srcY: 48,
    width: 50,
  });
  patchProp(data.entries.wallARclosed, {
    srcX: 7,
    srcY: 0,
    width: 48,
  });
});

jsonPatches.add('data/props/rhombus-area-text.json', (data: any) => {
  if (!sc.ru.shouldPatchSpriteLabels()) return;

  for (let prop of data.props) {
    switch (prop.name) {
      case 'titleItem':
      case 'titleScore':
      case 'contentItem':
      case 'contentScore':
        prop.fix.gfx = 'media/entity/objects/rhombus-arena-text.ru_RU.png';
    }
  }
});

jsonPatches.add('data/maps/rookie-harbor/teleporter.json', (data: any) => {
  if (ig.currentLang !== 'ru_RU') return;

  let entity = data.entities.find(
    (ent: any) =>
      ent.type === 'EventTrigger' && ent.settings.name === 'Entrance Sequence',
  );
  let tutorialStep = entity.settings.event.find(
    (stp: any) => stp.type === 'SHOW_TUTORIAL_START',
  );
  let step = tutorialStep.acceptStep.find(
    (stp: any) =>
      stp.type === 'SHOW_TUTORIAL_MSG' &&
      stp.pos.x === 205 &&
      stp.pos.y === 0 &&
      stp.size.x === 118 &&
      stp.size.y === 25,
  );
  if (step == null) return;

  step.pos.x = 131;
  step.size.x = 122;
});
