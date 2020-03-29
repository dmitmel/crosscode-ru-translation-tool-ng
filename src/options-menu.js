ig.module('crosscode-ru.fixes.options-menu')
  .requires(
    'game.feature.menu.gui.options.options-types',
    'crosscode-ru.ticker-display',
    'crosscode-ru.utils.localization',
  )
  .defines(() => {
    sc.OptionRow.inject({
      init(option, ...args) {
        this.parent(option, ...args);
        let lineHook = this.hook.children[1];
        let slopeHook = this.hook.children[2];

        if (this.option.type === 'CHECKBOX') {
          // NOTE: injections in simplify's "main" stage is executed much later
          // than this code, so I disable checkboxRightAlign here to avoid
          // interference with simplify because I do the same checkboxRightAlign
          // does, but apply it to every checkbox.
          this.option.checkboxRightAlign = false;

          this.typeGui.button.hook.align.x = ig.GUI_ALIGN.X_RIGHT;
          const additionalWidth =
            this.typeGui.hook.size.x - this.typeGui.button.hook.size.x;
          lineHook.size.x += additionalWidth;
          slopeHook.pos.x += additionalWidth;
        }

        this.nameGui.tickerHook.setMaxSize({
          x: lineHook.size.x - this.nameGui.hook.pos.x + 2,
        });
        this.nameGui.tickerHook.speed.x *= 1.25;
        this.nameGui.tickerHook.delayAtBorders.x /= 1.25;
      },

      update() {
        this.parent();
        // this._hasEntered is set in onMouseInteract of this class
        if (!this._hasEntered) this.nameGui.tickerHook.timer = 0;
      },
    });

    if (ig.currentLang !== 'ru_RU') return;

    const TRANSLATED_MOD_DESCRIPTIONS = {
      'crosscode-ru-ng': {
        orig: 'Russian translation for CrossCode',
        text: 'Русский перевод CrossCode',
      },
      'crosscode-ru-ng-translation-tool': {
        orig: 'Russian translation tool for CrossCode',
        text: 'Русский инструмент переводчика CrossCode',
      },
      'Localize Me': {
        orig: 'Add support for more locales, languages and translations',
        text:
          'Мод для создания дополнительных региональных настроек, языков и переводов',
      },
      'cc-world-map-overhaul': {
        orig: 'A better world map',
        text: 'Улучшенная карта мира',
      },
    };

    let allMods = window.activeMods.concat(window.inactiveMods);
    allMods.forEach(mod => {
      let descriptionFragment = TRANSLATED_MOD_DESCRIPTIONS[mod.name];
      if (descriptionFragment != null) {
        sc.ru.localizeProp(mod.manifest, 'description', descriptionFragment);
      }
    });

    // TODO: I hope I'll remove the event listener once I rewrite simplify.
    document.body.addEventListener('simplifyInitialized', () => {
      let lang = ig.lang.labels.sc.gui;

      sc.ru.localizeProp(lang.menu.option, 'mods', {
        orig: 'Mods',
        text: 'Моды',
      });
      sc.ru.localizeProp(lang.options['mods-description'], 'description', {
        orig:
          'In this menu you can \\c[3]enable or disable installed mods\\c[0]. Mod descriptions are shown below. \\c[1]The game needs to be restarted\\c[0] if you change any options here!',
        text:
          'В этом меню вы можете \\c[3]включать или выключать установленные моды\\c[0]. Описания модов отображаются внизу. \\c[1]Игра должна быть перезапущена\\c[0], если вы измените здесь какие-либо параметры!',
      });

      sc.ru.localizeProp(lang.options.headers, 'logLevel', {
        orig: 'Log levels',
        text: 'Настройки логирования через CCLoader',
      });

      sc.ru.localizeProp(lang.options['logLevel-log'], 'name', {
        orig: 'Log level: Default',
        text: 'Информационные сообщения',
      });
      sc.ru.localizeProp(lang.options['logLevel-log'], 'description', {
        orig: 'Enables default message popups. \\c[1]Needs a restart!',
        text:
          'Включает всплывающие окна информационных сообщений. \\c[1]Требуется перезапуск!',
      });

      sc.ru.localizeProp(lang.options['logLevel-warn'], 'name', {
        orig: 'Log level: Warnings',
        text: 'Предупреждения',
      });
      sc.ru.localizeProp(lang.options['logLevel-warn'], 'description', {
        orig: 'Enables warning popups. \\c[1]Needs a restart!',
        text:
          'Включает всплывающие окна предупреждений. \\c[1]Требуется перезапуск!',
      });

      sc.ru.localizeProp(lang.options['logLevel-error'], 'name', {
        orig: 'Log level: Errors',
        text: 'Ошибки',
      });
      sc.ru.localizeProp(lang.options['logLevel-error'], 'description', {
        orig: 'Enables error popups. \\c[1]Needs a restart!',
        text: 'Включает всплывающие окна ошибок. \\c[1]Требуется перезапуск!',
      });
    });
  });