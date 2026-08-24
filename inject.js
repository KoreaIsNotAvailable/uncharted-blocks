/* =========================================================
   언차티드 블록 - 자동 주입 스크립트
   -----------------------------------------------------------
   1단계: Entry.block 객체가 생기자마자 블록 "정의"부터 즉시 등록
          (저장된 작품을 불러올 때 엔트리가 블록을 그리기 전에
           정의가 반드시 먼저 있어야 하므로 최우선으로 처리)
   2단계: 워크스페이스/팔레트(blockMenu)가 준비되면 팔레트에 등록
   ========================================================= */
(function () {
  if (window.__unchartedExtensionLoaded) return;
  window.__unchartedExtensionLoaded = true;

  const LOG = (...args) => console.log('%c[언차티드 블록]', 'color:#3498DB;font-weight:bold;', ...args);

  /* ===================== 공통 유틸 ===================== */
  function getAllObjs() {
    return Entry.container.getAllObjects ? Entry.container.getAllObjects() : Entry.container.objects_;
  }
  function getXY(e) {
    return typeof e.getX === 'function' ? { x: e.getX(), y: e.getY() } : { x: e.x, y: e.y };
  }
  function getScale(e) {
    if (typeof e.getScaleX === 'function') return { sx: e.getScaleX(), sy: e.getScaleY() };
    if (typeof e.getSize === 'function') { const s = e.getSize() / 100; return { sx: s, sy: s }; }
    if (e.object && e.object.scaleX != null) return { sx: e.object.scaleX, sy: e.object.scaleY };
    return { sx: 1, sy: 1 };
  }
  function cloneCanvas(source) {
    const c = document.createElement('canvas');
    c.width = source.width;
    c.height = source.height;
    c.getContext('2d').drawImage(source, 0, 0);
    return c;
  }
  function ensureState(sprite) {
    // 엔트리가 모양(코스튬)을 진짜로 바꿔치기했는지 감지: 우리가 만든 캔버스가 아니면 원본 갱신
    if (!sprite.object.image || sprite.object.image.__unchartedGenerated !== true) {
      sprite.__originalCanvas = sprite.object.image;
    }
    if (!sprite.__unchartedState) {
      sprite.__unchartedState = { grayscale: 0, invert: 0, pixelate: 0, clipTargetId: null };
    }
    return sprite.__unchartedState;
  }
  function hasActiveEffect(state) {
    return state.grayscale > 0 || state.invert > 0 || state.pixelate > 0 || !!state.clipTargetId;
  }

  // 오브젝트의 화면 표시 이미지를 canvas로 교체 (renderEntity와 동일한 패턴으로 통일)
  function applyImageToEntity(sprite, canvas) {
    canvas.__unchartedGenerated = true; // ensureState가 이걸 "우리가 만든 것"으로 인식하게 표식
    sprite.__originalCanvas = canvas;   // 효과 렌더링 기준 원본도 갱신
    sprite.object.image = canvas;
    if (sprite.parent && sprite.parent.stage) sprite.parent.stage.update();
    else if (Entry.stage && Entry.stage.update) Entry.stage.update();
  }

  // 사용자 PC에서 이미지 파일을 선택받아 <img>로 로드해서 반환 (Promise)
  function pickImageFile() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        document.body.removeChild(input);
        if (!file) { reject(new Error('파일을 선택하지 않았습니다.')); return; }
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => resolve({ img, file });
          img.onerror = () => reject(new Error('이미지 디코딩에 실패했습니다.'));
          img.src = reader.result;
        };
        reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
        reader.readAsDataURL(file);
      });
      // 사용자가 파일 선택창을 취소한 경우도 처리 (change가 안 옴 → focus 복귀로 감지)
      window.addEventListener('focus', function onFocus() {
        window.removeEventListener('focus', onFocus);
        setTimeout(() => {
          if (document.body.contains(input) && (!input.files || input.files.length === 0)) {
            document.body.removeChild(input);
            reject(new Error('파일 선택이 취소되었습니다.'));
          }
        }, 300);
      });
      document.body.appendChild(input);
      input.click();
    });
  }

  function renderEntity(sprite) {
    const state = ensureState(sprite);
    let canvas = cloneCanvas(sprite.__originalCanvas);

    if (state.pixelate > 0) {
      const w = canvas.width, h = canvas.height;
      const blockSize = Math.max(1, Math.round((state.pixelate / 100) * 30));
      const small = document.createElement('canvas');
      small.width = Math.max(1, Math.floor(w / blockSize));
      small.height = Math.max(1, Math.floor(h / blockSize));
      small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
      const out = document.createElement('canvas');
      out.width = w; out.height = h;
      const octx = out.getContext('2d');
      octx.imageSmoothingEnabled = false;
      octx.drawImage(small, 0, 0, small.width, small.height, 0, 0, w, h);
      canvas = out;
    }

    if (state.grayscale > 0 || state.invert > 0) {
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const gRatio = state.grayscale / 100;
      const iRatio = state.invert / 100;
      for (let i = 0; i < data.length; i += 4) {
        if (gRatio > 0) {
          const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
          data[i] += (avg - data[i]) * gRatio;
          data[i + 1] += (avg - data[i + 1]) * gRatio;
          data[i + 2] += (avg - data[i + 2]) * gRatio;
        }
        if (iRatio > 0) {
          data[i] += (255 - data[i] - data[i]) * iRatio;
          data[i + 1] += (255 - data[i + 1] - data[i + 1]) * iRatio;
          data[i + 2] += (255 - data[i + 2] - data[i + 2]) * iRatio;
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }

    if (state.clipTargetId) {
      const targetObj = getAllObjs().find((o) => o.id === state.clipTargetId);
      if (targetObj) {
        const targetEntity = targetObj.entity;
        const maskCanvas = targetEntity.object.image;
        if (maskCanvas && maskCanvas.width > 0 && maskCanvas.height > 0) {
          const ctx = canvas.getContext('2d');
          const selfPos = getXY(sprite);
          const targetPos = getXY(targetEntity);
          const selfScale = getScale(sprite);
          const targetScale = getScale(targetEntity);
          const relSx = targetScale.sx / selfScale.sx;
          const relSy = targetScale.sy / selfScale.sy;
          const drawW = maskCanvas.width * relSx;
          const drawH = maskCanvas.height * relSy;
          const dx = (targetPos.x - selfPos.x) / selfScale.sx + (canvas.width / 2 - drawW / 2);
          const dy = -(targetPos.y - selfPos.y) / selfScale.sy + (canvas.height / 2 - drawH / 2);
          ctx.globalCompositeOperation = 'destination-in';
          ctx.drawImage(maskCanvas, dx, dy, drawW, drawH);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    }

    canvas.__unchartedGenerated = true;
    sprite.object.image = canvas;
    if (sprite.parent && sprite.parent.stage) sprite.parent.stage.update();
  }

  function fireCustomHatEvent(hatType) {
    const ws = Entry.getMainWS();
    const board = ws.board;
    const threads = board.code.getThreads();
    const objs = getAllObjs();
    if (!objs.length) return;
    const entity = objs[0].entity;
    const codeObj = entity.parent.script;

    const matched = threads.filter((t) => {
      const fb = t.getFirstBlock();
      const type = fb && (typeof fb.type === 'function' ? fb.type() : fb.type);
      return type === hatType;
    });

    matched.forEach((thread) => {
      let block = thread.getFirstBlock().getNextBlock();
      while (block) {
        try {
          new Entry.Executor(block, entity, codeObj).execute();
        } catch (e) {
          console.error('❌ 모자 블록 하위 실행 에러:', e);
        }
        block = typeof block.getNextBlock === 'function' ? block.getNextBlock() : null;
      }
    });
  }

  function entryToScreen(x, y) {
    const canvas = document.getElementById('entryCanvas');
    if (!canvas) throw new Error('엔트리 캔버스(entryCanvas)를 찾을 수 없습니다.');
    const internalW = canvas.width;
    const internalH = canvas.height;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / internalW;
    const scaleY = rect.height / internalH;
    const pixelX = rect.left + (internalW / 2 + x) * scaleX;
    const pixelY = rect.top + (internalH / 2 - y) * scaleY;
    return { pixelX, pixelY, scaleX, scaleY };
  }

  /* ===================== 1단계: 블록 정의 등록 ===================== */
  function registerBlockDefinitions() {
    if (window.__unchartedDefsRegistered) return;

    Entry.block.unofficial_grayscale = {
      color: '#7C5CBF', outerLine: '#5B4292', skeleton: 'basic',
      template: '모양 흑백 효과를 %1 % 만큼 적용하기',
      params: [{ type: 'Block', accept: 'string' }],
      class: 'uncharted_effects', isNotFor: [],
      paramsKeyMap: { VALUE: 0 },
      def: { params: [{ type: 'number', params: ['50'], statements: [] }], type: 'unofficial_grayscale' },
      func: function (sprite, script) {
        ensureState(sprite).grayscale = Math.max(0, Math.min(100, script.getNumberValue('VALUE', script)));
        renderEntity(sprite);
        return script.callReturn();
      },
    };

    Entry.block.unofficial_invert = {
      color: '#7C5CBF', outerLine: '#5B4292', skeleton: 'basic',
      template: '모양 반전 효과를 %1 % 만큼 적용하기',
      params: [{ type: 'Block', accept: 'string' }],
      class: 'uncharted_effects', isNotFor: [],
      paramsKeyMap: { VALUE: 0 },
      def: { params: [{ type: 'number', params: ['50'], statements: [] }], type: 'unofficial_invert' },
      func: function (sprite, script) {
        ensureState(sprite).invert = Math.max(0, Math.min(100, script.getNumberValue('VALUE', script)));
        renderEntity(sprite);
        return script.callReturn();
      },
    };

    Entry.block.unofficial_pixelate = {
      color: '#7C5CBF', outerLine: '#5B4292', skeleton: 'basic',
      template: '모양 모자이크 효과를 %1 % 만큼 적용하기',
      params: [{ type: 'Block', accept: 'string' }],
      class: 'uncharted_effects', isNotFor: [],
      paramsKeyMap: { VALUE: 0 },
      def: { params: [{ type: 'number', params: ['50'], statements: [] }], type: 'unofficial_pixelate' },
      func: function (sprite, script) {
        ensureState(sprite).pixelate = Math.max(0, Math.min(100, script.getNumberValue('VALUE', script)));
        renderEntity(sprite);
        return script.callReturn();
      },
    };

    Entry.block.unofficial_clipToObject = {
      color: '#E67E22', outerLine: '#B9600C', skeleton: 'basic',
      template: '모양을 %1 오브젝트에 클리핑하기',
      params: [{ type: 'DropdownDynamic', value: null, menuName: 'allSprites', fontSize: 11 }],
      class: 'uncharted_effects', isNotFor: [],
      paramsKeyMap: { TARGET: 0 },
      def: { params: [null], type: 'unofficial_clipToObject' },
      func: function (sprite, script) {
        const targetId = script.getStringValue('TARGET', script);
        const selfObj = getAllObjs().find((o) => o.entity === sprite);
        if (!selfObj) throw new Error('내 오브젝트 정보를 찾을 수 없습니다.');
        if (targetId === selfObj.id) throw new Error('자기 자신은 클리핑 대상으로 선택할 수 없습니다.');
        ensureState(sprite).clipTargetId = targetId;
        renderEntity(sprite);
        return script.callReturn();
      },
    };

    // 이미지 업로드 → 자신의 모양으로 저장 (교체 또는 새 모양 추가)
    Entry.block.unofficial_uploadPicture = {
      color: '#16A085', outerLine: '#117A65', skeleton: 'basic',
      template: '이미지 업로드해서 자신의 모양으로 %1',
      params: [
        { type: 'Dropdown', options: [['교체하기', 'replace'], ['새로 추가하기', 'add']], value: 'replace' },
      ],
      class: 'uncharted_effects', isNotFor: [],
      paramsKeyMap: { MODE: 0 },
      def: { params: ['replace'], type: 'unofficial_uploadPicture' },
      func: async function (sprite, script) {
        const mode = script.getStringValue('MODE', script);
        const selfObj = getAllObjs().find((o) => o.entity === sprite);
        if (!selfObj) throw new Error('내 오브젝트 정보를 찾을 수 없습니다.');

        let picked;
        try {
          picked = await pickImageFile();
        } catch (e) {
          console.warn('[이미지 업로드]', e.message);
          return script.callReturn(); // 취소 시 조용히 종료
        }

        const { img, file } = picked;

        // 캔버스로 변환 (엔트리 렌더 파이프라인과 호환되게)
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);

        if (mode === 'replace') {
          // 현재 모양을 이 이미지로 교체
          applyImageToEntity(sprite, canvas);
          LOG('✅ [이미지 업로드] 현재 모양을 교체했습니다:', file.name);
        } else {
          // 새 모양으로 추가 시도
          // ※ 주의: 엔트리 내부 pictures 데이터 구조에 대한 확신이 100%는 아니라서
          //   실패하면 콘솔에 원인을 남기고, 최소한 화면 표시는 되도록 폴백 처리
          try {
            const pictures = selfObj.pictures || (selfObj.pictures = []);
            const newId = 'uncharted_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            const newPic = {
              id: newId,
              name: (file.name || '업로드 모양').replace(/\.[^.]+$/, ''),
              type: 'user',
              filename: newId,
              fileurl: canvas.toDataURL('image/png'),
              imageType: 'png',
              dimension: { width: canvas.width, height: canvas.height },
            };
            pictures.push(newPic);

            // 모양 목록 UI가 있다면 갱신 시도 (실패해도 무시)
            try {
              if (Entry.playground && Entry.playground.object === selfObj && Entry.playground.injectPicture) {
                Entry.playground.injectPicture(selfObj);
              } else if (Entry.playground && typeof Entry.playground.reloadPlayground === 'function') {
                Entry.playground.reloadPlayground();
              }
            } catch (uiErr) {
              console.warn('[이미지 업로드] 모양 목록 UI 갱신 실패(무시):', uiErr.message);
            }

            // 지금 화면에 바로 반영도 해준다 (선택 안 해도 시각적으로 확인 가능하게)
            applyImageToEntity(sprite, canvas);

            LOG('✅ [이미지 업로드] 새 모양으로 추가했습니다:', newPic.name, '(pictures 배열에 push됨, UI 목록 반영은 미검증)');
          } catch (e) {
            console.warn('[이미지 업로드] 새 모양 추가 중 오류, 화면 표시만 적용:', e.message);
            applyImageToEntity(sprite, canvas);
          }
        }

        return script.callReturn();
      },
    };

    // 효과 이름(드롭다운 값) <-> 상태 객체의 키 매핑
    const EFFECT_KEY_MAP = { gray: 'grayscale', invert: 'invert', pixelate: 'pixelate' };

    // 붓 패턴 채우기: "자신의 (모양) 모양으로 (왜곡/자르기) 로 채우기"
    // - 자르기: 기존 방식(원본 크기 이미지를 repeat, 그린 경로로 클리핑된 것처럼 보임)
    // - 왜곡: 그리는 도중 실시간으로 지금까지의 경로 bounding box에 이미지를 늘려 맞춤
    //         (공식 "채우기 멈추기"(fill_stop) 블록이 눌릴 때까지 계속 갱신됨)
    Entry.block.unofficial_startPatternFill = {
      color: '#D35400', outerLine: '#A04000', skeleton: 'basic',
      template: '자신의 %1 모양으로 %2 로 채우기',
      params: [
        { type: 'DropdownDynamic', value: null, menuName: 'pictures', fontSize: 11 },
        { type: 'Dropdown', options: [['왜곡', 'distort'], ['자르기', 'crop']], value: 'distort' },
      ],
      class: 'uncharted_brush', isNotFor: [],
      paramsKeyMap: { PICTURE: 0, MODE: 1 },
      def: { params: [null, 'distort'], type: 'unofficial_startPatternFill' },
      func: async function (sprite, script) {
        const pictureValue = script.getStringValue('PICTURE', script);
        const mode = script.getStringValue('MODE', script);
        const selfObj = getAllObjs().find((o) => o.entity === sprite);
        if (!selfObj) throw new Error('내 오브젝트 정보를 찾을 수 없습니다.');

        const pictures = selfObj.pictures || [];
        const pic = pictures.find((p) => p.id === pictureValue || p.name === pictureValue) || pictures[0];
        if (!pic) throw new Error('모양 "' + pictureValue + '"을(를) 찾을 수 없습니다.');

        // 이미지 로드 (같은 모양이면 캐시 재사용)
        if (!sprite.__brushPatternImage || sprite.__brushPatternImage.__picId !== pic.id) {
          let img;
          let url = null;
          if (pic.fileurl) {
            url = pic.fileurl.startsWith('http') ? pic.fileurl : 'https://playentry.org' + pic.fileurl;
          } else if (pic.filename && typeof pic.filename === 'string') {
            const fn = pic.filename;
            url = 'https://playentry.org/uploads/' + fn.substring(0, 2) + '/' + fn.substring(2, 4) + '/image/' + fn + '.png';
          }

          if (url) {
            try {
              img = await new Promise((resolve, reject) => {
                const im = new Image();
                im.crossOrigin = 'Anonymous';
                im.onload = () => resolve(im);
                im.onerror = () => reject(new Error('로드 실패'));
                im.src = url;
              });
            } catch (e) {
              console.warn('[패턴 채우기] URL 로드 실패, 현재 모양 이미지로 대체:', url, e.message);
              img = null;
            }
          }

          if (!img) {
            const currentImg = sprite.object && sprite.object.image;
            if (currentImg && currentImg.width > 0) {
              img = currentImg;
            } else {
              throw new Error('패턴으로 쓸 이미지를 준비하지 못했습니다.');
            }
          }

          img.__picId = pic.id;
          sprite.__brushPatternImage = img;
        }

        // paint 좌표계 규칙(실측 확인됨): x는 엔트리 x와 동일, y는 반전(-getY())
        if (!sprite.paint) Entry.setBasicPaint(sprite);
        sprite.paint.stop = false;

        if (mode === 'crop') {
          sprite.__unchartedFillActive = false; // 왜곡 실시간 갱신 대상에서 제외
          sprite.paint.beginBitmapFill(sprite.__brushPatternImage, 'repeat');
        } else {
          // 왜곡 모드: 렌더 루프가 매 프레임 재계산하도록 표시
          sprite.__unchartedFillActive = true;
          sprite.__unchartedFillImage = sprite.__brushPatternImage;
          // 시작 시점엔 경로가 점 하나뿐이라 bbox가 0이므로, 우선 최소 크기로 채워둔다
          sprite.paint.beginBitmapFill(sprite.__brushPatternImage, 'no-repeat');
          hookEndFillForUnchartedFill(sprite);
        }

        return sprite.paint.moveTo(sprite.getX(), -1 * sprite.getY());
      },
    };

    // 공식 "채우기 멈추기"(fill_stop) 블록이 눌리면 왜곡 갱신을 멈추도록,
    // paint.endFill을 인스턴스 단위로 감싸서 감지한다 (원본 동작은 그대로 유지)
    function hookEndFillForUnchartedFill(sprite) {
      const paint = sprite.paint;
      if (!paint || paint.__unchartedEndFillHooked) return;
      const originalEndFill = paint.endFill.bind(paint);
      paint.endFill = function (...args) {
        sprite.__unchartedFillActive = false;
        return originalEndFill(...args);
      };
      paint.__unchartedEndFillHooked = true;
    }

    Entry.block.unofficial_addEffectAmount = {
      color: '#7C5CBF', outerLine: '#5B4292', skeleton: 'basic',
      template: '%1 효과를 %2 % 만큼 더하기',
      params: [
        {
          type: 'Dropdown',
          options: [['흑백', 'gray'], ['반전', 'invert'], ['모자이크', 'pixelate']],
          value: 'gray',
        },
        { type: 'Block', accept: 'string' },
      ],
      class: 'uncharted_effects', isNotFor: [],
      paramsKeyMap: { TYPE: 0, AMOUNT: 1 },
      def: { params: ['gray', { type: 'number', params: ['10'], statements: [] }], type: 'unofficial_addEffectAmount' },
      func: function (sprite, script) {
        const typeKey = EFFECT_KEY_MAP[script.getStringValue('TYPE', script)];
        if (!typeKey) throw new Error('알 수 없는 효과 종류입니다.');
        const amount = script.getNumberValue('AMOUNT', script);
        const state = ensureState(sprite);
        state[typeKey] = Math.max(0, Math.min(100, (state[typeKey] || 0) + amount));
        renderEntity(sprite);
        return script.callReturn();
      },
    };

    Entry.block.unofficial_getEffectAmount = {
      color: '#7C5CBF', outerLine: '#5B4292', skeleton: 'basic_string_field',
      template: '%1 오브젝트의 %2 효과 강도 값',
      params: [
        { type: 'DropdownDynamic', value: null, menuName: 'allSprites', fontSize: 11 },
        {
          type: 'Dropdown',
          options: [['흑백', 'gray'], ['반전', 'invert'], ['모자이크', 'pixelate']],
          value: 'gray',
        },
      ],
      class: 'uncharted_effects', isNotFor: [],
      paramsKeyMap: { TARGET: 0, TYPE: 1 },
      def: { params: [null, 'gray'], type: 'unofficial_getEffectAmount' },
      func: function (sprite, script) {
        const targetId = script.getStringValue('TARGET', script);
        const typeKey = EFFECT_KEY_MAP[script.getStringValue('TYPE', script)];
        if (!typeKey) throw new Error('알 수 없는 효과 종류입니다.');
        const targetObj = getAllObjs().find((o) => o.id === targetId);
        if (!targetObj) throw new Error('오브젝트를 찾을 수 없습니다.');
        const state = targetObj.entity.__unchartedState;
        return state ? (state[typeKey] || 0) : 0;
      },
    };

    // ===================== 생성형 AI (Groq API) =====================
    // 오브젝트별 대화 상태: { systemPrompt, history: [{role, content}, ...] }
    function ensureAiState(sprite) {
      if (!sprite.__unchartedAiState) {
        sprite.__unchartedAiState = { systemPrompt: '', history: [] };
      }
      return sprite.__unchartedAiState;
    }

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // 429(요청 한도 초과) 시 몇 초 기다렸다 재시도. 계속 실패하면 null 반환(호출부에서 안내 문구 처리)
    async function callGroqWithRetry(apiKey, messages, maxRetries) {
      const waitTimes = [3000, 6000, 10000]; // 3초 → 6초 → 10초
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey,
          },
          body: JSON.stringify({
            model: 'openai/gpt-oss-20b',
            messages: messages,
          }),
        });

        if (res.status === 429) {
          if (attempt < maxRetries) {
            const retryAfterHeader = res.headers.get('retry-after');
            const waitMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : waitTimes[attempt] || 10000;
            console.warn('[생성형 AI] 요청 한도 초과, ' + Math.round(waitMs / 1000) + '초 후 재시도 (' + (attempt + 1) + '/' + maxRetries + ')');
            await sleep(waitMs);
            continue;
          }
          return { ok: false, rateLimited: true };
        }

        if (!res.ok) {
          const errText = await res.text();
          throw new Error('Groq API 오류(' + res.status + '): ' + errText.slice(0, 200));
        }

        const data = await res.json();
        const answer = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (!answer) throw new Error('AI 응답을 읽을 수 없습니다.');
        return { ok: true, answer };
      }
      return { ok: false, rateLimited: true };
    }

    Entry.block.unofficial_setAiRole = {
      color: '#00A86B', outerLine: '#00754A', skeleton: 'basic',
      template: '생성형 AI 역할 설정하기 %1',
      params: [{ type: 'Block', accept: 'string' }],
      class: 'uncharted_ai', isNotFor: [],
      paramsKeyMap: { ROLE: 0 },
      def: { params: [{ type: 'text', params: ['너는 친절한 도우미야.'], statements: [] }], type: 'unofficial_setAiRole' },
      func: function (sprite, script) {
        const role = script.getStringValue('ROLE', script);
        const state = ensureAiState(sprite);
        state.systemPrompt = role;
        return script.callReturn();
      },
    };

    Entry.block.unofficial_askAi = {
      color: '#00A86B', outerLine: '#00754A', skeleton: 'basic_string_field',
      template: 'AI에게 %1 물어보고 대답 받기 %2',
      params: [
        { type: 'Block', accept: 'string' }, // 질문 내용
        {
          type: 'Dropdown',
          options: [['새로 시작', 'reset'], ['기억하기', 'remember']],
          value: 'reset',
        },
      ],
      class: 'uncharted_ai', isNotFor: [],
      paramsKeyMap: { CONTENT: 0, MODE: 1 },
      def: {
        params: [
          { type: 'text', params: ['안녕?'], statements: [] },
          'reset',
        ],
        type: 'unofficial_askAi',
      },
      func: async function (sprite, script) {
        const content = script.getStringValue('CONTENT', script);
        const mode = script.getStringValue('MODE', script);

        const apiKey = window.__unchartedGroqKey;
        if (!apiKey) throw new Error('Groq API 키가 설정되지 않았습니다. 확장 프로그램 팝업에서 먼저 키를 등록해주세요.');

        const state = ensureAiState(sprite);
        if (mode === 'reset') state.history = [];

        const messages = [];
        if (state.systemPrompt) messages.push({ role: 'system', content: state.systemPrompt });
        messages.push(...state.history);
        messages.push({ role: 'user', content });

        let result;
        try {
          result = await callGroqWithRetry(apiKey, messages, 2); // 최초 시도 + 최대 2번 재시도
        } catch (e) {
          console.warn('[생성형 AI]', e.message);
          throw new Error('AI 요청 실패: ' + e.message);
        }

        if (!result.ok) {
          // 재시도까지 다 실패(계속 요청 한도 초과) → 에러를 던지지 않고 안내 문자열을 값으로 반환
          return '(요청이 많아 잠시 후 다시 시도해 주세요)';
        }

        const answer = result.answer;
        if (mode === 'remember') {
          state.history.push({ role: 'user', content });
          state.history.push({ role: 'assistant', content: answer });
        }

        return answer;
      },
    };

    Entry.block.unofficial_isPageVisible = {
      color: '#4CAF50', outerLine: '#3d8b40', skeleton: 'basic_boolean_field',
      template: '엔트리 화면이 보이는 상태인가?',
      params: [], class: 'uncharted_sensing', isNotFor: [],
      def: { params: [], type: 'unofficial_isPageVisible' },
      func: function () { return !document.hidden; },
    };

    window.__unchartedWebsites = window.__unchartedWebsites || [];
    Entry.block.unofficial_createWebsite = {
      color: '#3498DB', outerLine: '#2874A6', skeleton: 'basic',
      template: '%1 사이트를 x:%2 y:%3 에 %4 x %5 크기로 생성하기',
      params: [
        { type: 'Block', accept: 'string' }, { type: 'Block', accept: 'string' },
        { type: 'Block', accept: 'string' }, { type: 'Block', accept: 'string' },
        { type: 'Block', accept: 'string' },
      ],
      class: 'uncharted_web', isNotFor: [],
      paramsKeyMap: { URL: 0, X: 1, Y: 2, WIDTH: 3, HEIGHT: 4 },
      def: {
        params: [
          { type: 'text', params: ['https://playentry.org'], statements: [] },
          { type: 'number', params: ['0'], statements: [] },
          { type: 'number', params: ['0'], statements: [] },
          { type: 'number', params: ['200'], statements: [] },
          { type: 'number', params: ['150'], statements: [] },
        ],
        type: 'unofficial_createWebsite',
      },
      func: function (sprite, script) {
        const url = script.getStringValue('URL', script);
        const x = script.getNumberValue('X', script);
        const y = script.getNumberValue('Y', script);
        const w = script.getNumberValue('WIDTH', script);
        const h = script.getNumberValue('HEIGHT', script);
        const { pixelX, pixelY, scaleX, scaleY } = entryToScreen(x, y);
        const pixelW = w * scaleX;
        const pixelH = h * scaleY;

        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.style.position = 'fixed';
        iframe.style.left = (pixelX - pixelW / 2) + 'px';
        iframe.style.top = (pixelY - pixelH / 2) + 'px';
        iframe.style.width = pixelW + 'px';
        iframe.style.height = pixelH + 'px';
        iframe.style.border = '1px solid #ccc';
        iframe.style.zIndex = 9999;
        document.body.appendChild(iframe);
        window.__unchartedWebsites.push(iframe);

        iframe.addEventListener('load', function () {
          fireCustomHatEvent('unofficial_when_webpage_created');
        });

        return script.callReturn();
      },
    };

    Entry.block.unofficial_when_webpage_created = {
      color: '#3498DB', outerLine: '#2874A6', skeleton: 'basic_event',
      template: '웹페이지가 생성되었을 때',
      params: [], class: 'event', isNotFor: [], events: {},
      def: { params: [], type: 'unofficial_when_webpage_created' },
      func: function (sprite, script) { return script.callReturn(); },
    };

    if (!window.__unchartedStopHandler) {
      Entry.addEventListener('stop', function () {
        Entry.container.getCurrentObjects().forEach(function (obj) {
          const entity = obj.entity;
          if (entity && entity.__originalCanvas) {
            entity.object.image = entity.__originalCanvas;
            entity.__unchartedState = { grayscale: 0, invert: 0, pixelate: 0, clipTargetId: null };
          }
        });
        if (Entry.stage && Entry.stage.update) Entry.stage.update();
        window.__unchartedWebsites.forEach((f) => f.remove());
        window.__unchartedWebsites = [];
      });
      window.__unchartedStopHandler = true;
    }

    if (!window.__unchartedRenderLoopStarted) {
      (function loop() {
        try {
          Entry.container.getCurrentObjects().forEach((obj) => {
            try {
              const entity = obj.entity;
              if (entity && entity.__unchartedState && hasActiveEffect(entity.__unchartedState)) {
                renderEntity(entity);
              }
              if (entity && entity.__unchartedFillActive && entity.paint) {
                updateDistortFill(entity);
              }
            } catch (innerErr) {
              // 오브젝트 하나가 실패해도 다른 오브젝트들은 계속 갱신되게 함
              console.warn('[언차티드 블록] 렌더 중 오류(무시하고 계속):', innerErr.message);
            }
          });
        } catch (outerErr) {
          console.warn('[언차티드 블록] 루프 오류(무시하고 계속):', outerErr.message);
        } finally {
          // 어떤 에러가 나든 루프는 반드시 계속되도록 finally에서 재호출
          requestAnimationFrame(loop);
        }
      })();
      window.__unchartedRenderLoopStarted = true;
    }

    // "왜곡" 모드 붓 채우기: 매 프레임, 지금까지 그려진 경로의 bounding box에
    // 이미지가 맞게 늘어나도록 다시 채운다. 경로 좌표는 우리가 직접 누적 보관해서
    // beginBitmapFill 재호출로 인한 내부 경로 리셋의 영향을 받지 않게 한다.
    function updateDistortFill(sprite) {
      const paint = sprite.paint;
      const img = sprite.__unchartedFillImage;
      if (!paint || !img) return;

      hookEndFillForUnchartedFill(sprite);

      // 지금까지 쌓인 좌표(MoveTo/LineTo)를 읽어 우리 쪽 경로 배열에 누적 반영
      const instructions = paint._activeInstructions || paint.instructions || [];
      const pts = instructions
        .filter((c) => typeof c.x === 'number' && typeof c.y === 'number')
        .map((c) => ({ x: c.x, y: c.y }));

      // 현재 그리고 있는 진행 중 좌표(마지막 위치)도 포함시켜 실시간 반응성을 높인다
      const liveX = sprite.getX();
      const liveY = -1 * sprite.getY();
      if (pts.length === 0 || pts[pts.length - 1].x !== liveX || pts[pts.length - 1].y !== liveY) {
        pts.push({ x: liveX, y: liveY });
      }

      if (pts.length < 2) return; // 점이 하나뿐이면 아직 도형이 아님

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      pts.forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });

      const boxW = Math.max(1, maxX - minX);
      const boxH = Math.max(1, maxY - minY);
      const scaleX = boxW / img.width;
      const scaleY = boxH / img.height;
      // Matrix2D(a, b, c, d, tx, ty): 이미지 로컬좌표(0..width, 0..height)를 bbox로 매핑
      const matrix = new createjs.Matrix2D(scaleX, 0, 0, scaleY, minX, minY);

      paint.beginBitmapFill(img, 'no-repeat', matrix);
      paint.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        paint.lineTo(pts[i].x, pts[i].y);
      }
      if (Entry.stage && Entry.stage.update) Entry.stage.update();
    }

    /* --- 콘솔에 입력하기 --- */
    Entry.block.unofficial_consoleLog = {
      color: '#95A5A6', outerLine: '#7f8c8d', skeleton: 'basic',
      template: '콘솔에 %1 입력하기',
      params: [{ type: 'Block', accept: 'string' }],
      class: 'uncharted_debug', isNotFor: [],
      paramsKeyMap: { VALUE: 0 },
      def: { params: [{ type: 'text', params: ['안녕하세요'], statements: [] }], type: 'unofficial_consoleLog' },
      func: function (sprite, script) {
        const value = script.getStringValue('VALUE', script);
        console.log('%c[엔트리 콘솔 출력]', 'color:#f1c40f;font-weight:bold;', value);
        return script.callReturn();
      },
    };

    /* --- 비공식 블록 패키지 라이브러리 시스템 --- */
    window.__unchartedLibrary = window.__unchartedLibrary || {};

    // 예시 패키지: 시간 블록 (라이브러리 동작 확인용 샘플)
    if (!window.__unchartedLibrary['time']) {
      window.__unchartedLibrary['time'] = {
        label: '시간 블록',
        defineBlocks: function () {
          if (Entry.block.unofficial_getTimestamp) return;
          Entry.block.unofficial_getTimestamp = {
            color: '#16A085', outerLine: '#117A65', skeleton: 'basic_string_field',
            template: '현재 시간(초)',
            params: [], class: 'uncharted_time', isNotFor: [],
            def: { params: [], type: 'unofficial_getTimestamp' },
            func: function () { return Math.floor(Date.now() / 1000); },
          };
        },
        palette: [['calc', 'unofficial_getTimestamp']],
      };
    }

    // 레거시 안전 도구: 커뮤니티에서 공유되던 "스페셜블록" 계열 중
    // eval() / 자동 게시글 업로드 등 위험 요소를 전부 제거하고
    // 같은 기능을 안전한 방식으로 재구현한 패키지
    if (!window.__unchartedLibrary['legacySafe']) {
      window.__unchartedLibrary['legacySafe'] = {
        label: '레거시 안전 도구',
        defineBlocks: function () {
          if (Entry.block.unofficial_getBrowserInfo) return;

          Entry.block.unofficial_getBrowserInfo = {
            color: '#607D8B', outerLine: '#455A64', skeleton: 'basic_string_field',
            template: '컴퓨터 정보(브라우저)',
            params: [], class: 'uncharted_legacy', isNotFor: [],
            def: { params: [], type: 'unofficial_getBrowserInfo' },
            func: function () { return navigator.userAgent; },
          };

          Entry.block.unofficial_isDesktopOS = {
            color: '#607D8B', outerLine: '#455A64', skeleton: 'basic_boolean_field',
            template: '데스크탑(PC) 환경인가?',
            params: [], class: 'uncharted_legacy', isNotFor: [],
            def: { params: [], type: 'unofficial_isDesktopOS' },
            func: function () {
              const ua = navigator.userAgent.toLowerCase();
              return ['win', 'mac', 'linux', 'x11'].some((k) => ua.includes(k)) && !/mobile|android|iphone|ipad/.test(ua);
            },
          };

          Entry.block.unofficial_showAlert = {
            color: '#795548', outerLine: '#5D4037', skeleton: 'basic',
            template: '%1 내용으로 알림창 띄우기',
            params: [{ type: 'Block', accept: 'string' }],
            class: 'uncharted_legacy', isNotFor: [],
            paramsKeyMap: { VALUE: 0 },
            def: { params: [{ type: 'text', params: ['안녕하세요'], statements: [] }], type: 'unofficial_showAlert' },
            func: function (sprite, script) {
              window.alert(script.getStringValue('VALUE', script));
              return script.callReturn();
            },
          };

          Entry.block.unofficial_showConfirm = {
            color: '#795548', outerLine: '#5D4037', skeleton: 'basic_boolean_field',
            template: '%1 내용으로 확인창(예/아니오) 띄우기',
            params: [{ type: 'Block', accept: 'string' }],
            class: 'uncharted_legacy', isNotFor: [],
            paramsKeyMap: { VALUE: 0 },
            def: { params: [{ type: 'text', params: ['계속할까요?'], statements: [] }] },
            func: function (sprite, script) {
              return window.confirm(script.getStringValue('VALUE', script));
            },
          };

          Entry.block.unofficial_showPrompt = {
            color: '#795548', outerLine: '#5D4037', skeleton: 'basic_string_field',
            template: '%1 내용으로 입력창 띄우고 입력값 가져오기',
            params: [{ type: 'Block', accept: 'string' }],
            class: 'uncharted_legacy', isNotFor: [],
            paramsKeyMap: { VALUE: 0 },
            def: { params: [{ type: 'text', params: ['입력해주세요'], statements: [] }] },
            func: function (sprite, script) {
              return window.prompt(script.getStringValue('VALUE', script)) || '';
            },
          };

          function safeJsonParse(raw) {
            try {
              return JSON.parse(raw);
            } catch (e) {
              throw new Error('JSON 형식이 올바르지 않습니다 (큰따옴표를 사용해야 해요). 예: ["1","2","3"]');
            }
          }

          Entry.block.unofficial_arrayItem = {
            color: '#8E44AD', outerLine: '#6C3483', skeleton: 'basic_string_field',
            template: 'JSON 배열 %1 의 %2 번째 항목',
            params: [{ type: 'Block', accept: 'string' }, { type: 'Block', accept: 'string' }],
            class: 'uncharted_legacy', isNotFor: [],
            paramsKeyMap: { ARRAY: 0, NUM: 1 },
            def: {
              params: [
                { type: 'text', params: ['["1","2","3"]'], statements: [] },
                { type: 'number', params: ['1'], statements: [] },
              ],
            },
            func: function (sprite, script) {
              const arr = safeJsonParse(script.getStringValue('ARRAY', script));
              if (!Array.isArray(arr)) throw new Error('입력한 JSON이 배열이 아닙니다.');
              const idx = script.getNumberValue('NUM', script) - 1;
              return arr[idx] !== undefined ? arr[idx] : '';
            },
          };

          Entry.block.unofficial_arrayLength = {
            color: '#8E44AD', outerLine: '#6C3483', skeleton: 'basic_string_field',
            template: 'JSON 배열 %1 의 항목 수',
            params: [{ type: 'Block', accept: 'string' }],
            class: 'uncharted_legacy', isNotFor: [],
            paramsKeyMap: { ARRAY: 0 },
            def: { params: [{ type: 'text', params: ['["1","2","3"]'], statements: [] }] },
            func: function (sprite, script) {
              const arr = safeJsonParse(script.getStringValue('ARRAY', script));
              if (!Array.isArray(arr)) throw new Error('입력한 JSON이 배열이 아닙니다.');
              return arr.length;
            },
          };

          Entry.block.unofficial_jsonValue = {
            color: '#8E44AD', outerLine: '#6C3483', skeleton: 'basic_string_field',
            template: 'JSON %1 의 %2 값',
            params: [{ type: 'Block', accept: 'string' }, { type: 'Block', accept: 'string' }],
            class: 'uncharted_legacy', isNotFor: [],
            paramsKeyMap: { JSONSTR: 0, KEY: 1 },
            def: {
              params: [
                { type: 'text', params: ['{"title":"안녕"}'], statements: [] },
                { type: 'text', params: ['title'], statements: [] },
              ],
            },
            func: function (sprite, script) {
              const obj = safeJsonParse(script.getStringValue('JSONSTR', script));
              const key = script.getStringValue('KEY', script);
              return obj[key] !== undefined ? obj[key] : '';
            },
          };

          Entry.block.unofficial_jsonKeyCount = {
            color: '#8E44AD', outerLine: '#6C3483', skeleton: 'basic_string_field',
            template: 'JSON %1 의 항목 수',
            params: [{ type: 'Block', accept: 'string' }],
            class: 'uncharted_legacy', isNotFor: [],
            paramsKeyMap: { JSONSTR: 0 },
            def: { params: [{ type: 'text', params: ['{"title":"안녕"}'], statements: [] }] },
            func: function (sprite, script) {
              const obj = safeJsonParse(script.getStringValue('JSONSTR', script));
              return Object.keys(obj).length;
            },
          };

          Entry.block.unofficial_fetchJson = {
            color: '#2980B9', outerLine: '#1F618D', skeleton: 'basic_string_field',
            template: '%1 주소에서 JSON 가져오기',
            params: [{ type: 'Block', accept: 'string' }],
            class: 'uncharted_legacy', isNotFor: [],
            paramsKeyMap: { URL: 0 },
            def: { params: [{ type: 'text', params: ['https://playentry.org/api/discuss/findNotice'], statements: [] }] },
            func: async function (sprite, script) {
              const url = script.getStringValue('URL', script);
              try {
                const res = await fetch(url);
                const data = await res.json();
                return JSON.stringify(data);
              } catch (e) {
                throw new Error('가져오기 실패: ' + e.message);
              }
            },
          };

          Entry.block.unofficial_toast = {
            color: '#16A085', outerLine: '#117A65', skeleton: 'basic',
            template: '%1 제목 %2 내용의 %3 알림 띄우기',
            params: [
              { type: 'Block', accept: 'string' },
              { type: 'Block', accept: 'string' },
              {
                type: 'Dropdown',
                options: [['성공', 'success'], ['경고', 'warning'], ['오류', 'alert']],
                value: 'success',
              },
            ],
            class: 'uncharted_legacy', isNotFor: [],
            paramsKeyMap: { TITLE: 0, CONTENT: 1, TYPE: 2 },
            def: {
              params: [
                { type: 'text', params: ['제목'], statements: [] },
                { type: 'text', params: ['내용'], statements: [] },
                'success',
              ],
            },
            func: function (sprite, script) {
              const title = script.getStringValue('TITLE', script);
              const content = script.getStringValue('CONTENT', script);
              const type = script.getStringValue('TYPE', script);
              const toastFn = Entry.toast && Entry.toast[type];
              if (typeof toastFn === 'function') {
                toastFn.call(Entry.toast, title, content, true);
              } else {
                console.log('[알림]', title, content);
              }
              return script.callReturn();
            },
          };
        },
        palette: [
          ['calc', 'unofficial_getBrowserInfo'],
          ['judgement', 'unofficial_isDesktopOS'],
          ['looks', 'unofficial_showAlert'],
          ['judgement', 'unofficial_showConfirm'],
          ['calc', 'unofficial_showPrompt'],
          ['calc', 'unofficial_arrayItem'],
          ['calc', 'unofficial_arrayLength'],
          ['calc', 'unofficial_jsonValue'],
          ['calc', 'unofficial_jsonKeyCount'],
          ['calc', 'unofficial_fetchJson'],
          ['looks', 'unofficial_toast'],
        ],
      };
    }

    const libraryKeys = Object.keys(window.__unchartedLibrary);
    Entry.block.unofficial_loadPackage = {
      color: '#8E44AD', outerLine: '#6C3483', skeleton: 'basic',
      template: '%1 블록 불러오기',
      params: [{
        type: 'Dropdown',
        options: libraryKeys.map((key) => [window.__unchartedLibrary[key].label, key]),
        value: libraryKeys[0] || '',
      }],
      class: 'uncharted_debug', isNotFor: [],
      paramsKeyMap: { PACKAGE: 0 },
      def: { params: [libraryKeys[0] || ''], type: 'unofficial_loadPackage' },
      func: function (sprite, script) {
        const key = script.getStringValue('PACKAGE', script);
        console.log('▶ 불러오려는 패키지 키:', key);
        const pkg = window.__unchartedLibrary[key];
        if (!pkg) throw new Error('"' + key + '" 패키지를 라이브러리에서 찾을 수 없습니다.');

        pkg.defineBlocks();

        const bm = window.__bm;
        pkg.palette.forEach(([category, type]) => {
          try {
            if (bm._threadsMap && bm._threadsMap[type] && !bm.getThreadByBlockKey(type)) {
              delete bm._threadsMap[type];
            }
            bm.addCategoryData(category, type);
          } catch (e) {
            console.warn('패키지 팔레트 등록 실패:', type, e.message);
          }
        });

        console.log('✅ "' + pkg.label + '" 패키지 불러오기 완료 (팔레트에서 확인해보세요)');
        return script.callReturn();
      },
    };

    window.__unchartedDefsRegistered = true;
    LOG('1단계 완료: 블록 정의 13종 등록됨 (저장된 작품 로드 대비 완료)');
  }

  /* ===================== 2단계: 팔레트 등록 ===================== */
  function registerPalette() {
    let ws, bm;
    try {
      ws = Entry.getMainWS();
      bm = (Entry.playground && Entry.playground.blockMenu) || (ws.board && ws.board.blockMenu) || ws.blockMenu;
    } catch (e) { return false; }
    if (!bm) return false;

    window.__bm = bm;
    const registrations = [
      ['looks', 'unofficial_grayscale'],
      ['looks', 'unofficial_invert'],
      ['looks', 'unofficial_pixelate'],
      ['looks', 'unofficial_clipToObject'],
      ['looks', 'unofficial_uploadPicture'],
      ['brush', 'unofficial_startPatternFill'],
      ['looks', 'unofficial_addEffectAmount'],
      ['calc', 'unofficial_getEffectAmount'],
      ['looks', 'unofficial_createWebsite'],
      ['judgement', 'unofficial_isPageVisible'],
      ['start', 'unofficial_when_webpage_created'],
      ['calc', 'unofficial_consoleLog'],
      ['calc', 'unofficial_setAiRole'],
      ['calc', 'unofficial_askAi'],
      ['expansion', 'unofficial_loadPackage'],
    ];

    registrations.forEach(([category, type]) => {
      try {
        if (bm._threadsMap && bm._threadsMap[type] && !bm.getThreadByBlockKey(type)) {
          delete bm._threadsMap[type];
        }
        bm.addCategoryData(category, type);
      } catch (e) {
        // 아직 준비가 덜 됐을 수 있으니 조용히 넘어가고 다음 재시도 때 다시 시도
      }
    });

    LOG('2단계 완료: 팔레트에 블록 15종 등록됨');
    return true;
  }

  window.__unchartedForceReapply = function () {
    registerBlockDefinitions();
    const ok = registerPalette();
    return ok ? '재등록 성공' : '아직 워크스페이스가 준비되지 않음 (에디터 화면에서 다시 시도)';
  };

  /* ===================== 준비될 때까지 재시도 ===================== */
  let defsTimer = setInterval(function () {
    if (typeof Entry !== 'undefined' && Entry.block) {
      registerBlockDefinitions();
      clearInterval(defsTimer);
    }
  }, 50);

  let paletteTimer = setInterval(function () {
    if (window.__unchartedDefsRegistered) {
      const ok = registerPalette();
      if (ok) clearInterval(paletteTimer);
    }
  }, 300);

  // 안전장치: 60초 넘게 못 찾으면 재시도 중단 (플레이 전용 페이지 등)
  setTimeout(() => { clearInterval(defsTimer); clearInterval(paletteTimer); }, 60000);

  // 감시병: 엔트리가 SPA 내부적으로 재초기화되어 우리 블록 정의가
  // 사라지는 경우(저장 실패, 효과 소실의 주된 원인으로 추정)를 3초마다 감시하고
  // 사라졌으면 조용히 다시 심어준다.
  setInterval(function () {
    try {
      if (typeof Entry === 'undefined' || !Entry.block) return;
      if (!Entry.block.unofficial_grayscale) {
        console.warn('[언차티드 블록] 블록 정의가 사라진 것을 감지했습니다. 다시 등록합니다.');
        window.__unchartedDefsRegistered = false;
        registerBlockDefinitions();
        registerPalette();
      }
    } catch (e) {
      // 감시병 자체는 절대 죽지 않아야 하므로 에러를 삼킴
    }
  }, 3000);

  // ===== 사용자 커스텀 코드 스니펫 =====
  // bridge.js(isolated world)가 chrome.storage에서 읽어 postMessage로 보내주면 실행
  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== '__UNCHARTED_SNIPPETS_RESPONSE__') return;
    const snippets = event.data.snippets || [];
    LOG('bridge.js로부터 응답 받음. 스니펫 개수:', snippets.length);
    snippets.forEach(function (snip) {
      try {
        LOG('커스텀 코드 실행: "' + snip.title + '"');
        new Function(snip.code)();
      } catch (e) {
        console.error('[언차티드 블록] 커스텀 코드 "' + snip.title + '" 실행 중 에러:', e);
      }
    });
  });

  // 우리 블록 정의가 준비된 뒤에 스니펫을 요청 (스니펫 안에서 우리 헬퍼를 쓸 수 있도록)
  let snippetRequestTimer = setInterval(function () {
    if (window.__unchartedDefsRegistered) {
      LOG('bridge.js에 커스텀 코드 스니펫 요청 전송...');
      window.postMessage({ type: '__UNCHARTED_REQUEST_SNIPPETS__' }, '*');
      clearInterval(snippetRequestTimer);
    }
  }, 300);
  setTimeout(() => clearInterval(snippetRequestTimer), 60000);

  // ===== Groq API 키 (팝업에서 저장, 블록에서는 값을 직접 보지 않고 자동으로 사용) =====
  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== '__UNCHARTED_GROQ_KEY_RESPONSE__') return;
    window.__unchartedGroqKey = event.data.apiKey || '';
  });

  function requestGroqKey() {
    window.postMessage({ type: '__UNCHARTED_REQUEST_GROQ_KEY__' }, '*');
  }
  requestGroqKey();
  // 팝업에서 키를 새로 저장/변경했을 수 있으니 주기적으로 갱신 (가볍게 5초마다)
  setInterval(requestGroqKey, 5000);
})();
