// FUNCTION 180151340

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_180151340(undefined8 param_1,undefined8 param_2)

{
  code *pcVar1;
  undefined4 uVar2;
  undefined4 uVar3;
  longlong lVar4;
  bool bVar5;
  bool bVar6;
  bool bVar7;
  ulonglong uVar8;
  undefined4 uVar9;
  int iVar10;
  undefined8 uVar11;
  undefined8 uVar12;
  undefined8 *puVar13;
  undefined8 *puVar14;
  longlong lVar15;
  undefined1 auStack_388 [32];
  undefined8 *puStack_368;
  undefined8 *puStack_340;
  undefined8 uStack_338;
  undefined8 uStack_330;
  undefined2 uStack_320;
  undefined2 uStack_31e;
  undefined4 uStack_31c;
  undefined4 uStack_318;
  undefined4 uStack_314;
  undefined8 uStack_310;
  ulonglong uStack_308;
  undefined2 uStack_300;
  undefined6 uStack_2fe;
  undefined8 uStack_2f0;
  ulonglong uStack_2e8;
  undefined4 uStack_2e0;
  undefined2 uStack_2d0;
  undefined6 uStack_2ce;
  undefined8 uStack_2c0;
  ulonglong uStack_2b8;
  undefined2 uStack_2b0;
  undefined6 uStack_2ae;
  undefined8 uStack_2a0;
  ulonglong uStack_298;
  undefined1 auStack_290 [32];
  longlong alStack_270 [3];
  ulonglong uStack_258;
  undefined1 auStack_218 [24];
  undefined1 auStack_200 [392];
  ulonglong uStack_78;
  
  uStack_78 = _DAT_181f8ca80 ^ (ulonglong)auStack_388;
  uStack_2e0 = 0;
  uStack_330 = param_1;
  uVar9 = FUN_180f9bbb4();
  puStack_340 = (undefined8 *)&UNK_181cf7ae8;
  uStack_338 = 6;
  FUN_18014a5d0(&uStack_300,uVar9,&puStack_340);
  uStack_2e0 = 0x61;
  uVar11 = FUN_18014ae00(param_2,&uStack_2d0);
  bVar6 = false;
  bVar5 = false;
  uStack_2e0 = 99;
  puStack_340 = (undefined8 *)&uStack_300;
  if (7 < uStack_2e8) {
    puStack_340 = (undefined8 *)CONCAT62(uStack_2fe,uStack_300);
  }
  uStack_338 = uStack_2f0;
  iVar10 = FUN_18014ab10(uVar11,&puStack_340);
  if (iVar10 != 0) {
    uVar9 = FUN_180f9bbb4();
    puStack_340 = (undefined8 *)&UNK_181cf7af0;
    uStack_338 = 7;
    FUN_18014a5d0(&uStack_320,uVar9,&puStack_340);
    uStack_2e0 = 0x1e7;
    uVar11 = FUN_18014ae00(param_2,&uStack_2b0);
    bVar6 = true;
    bVar5 = true;
    puStack_340 = (undefined8 *)&uStack_320;
    if (7 < uStack_308) {
      puStack_340 = (undefined8 *)CONCAT44(uStack_31c,CONCAT22(uStack_31e,uStack_320));
    }
    uStack_338 = uStack_310;
    iVar10 = FUN_18014ab10(uVar11,&puStack_340);
    if (iVar10 != 0) {
      bVar7 = false;
      goto LAB_18015146b;
    }
  }
  bVar7 = true;
LAB_18015146b:
  if (bVar5) {
    if (7 < uStack_298) {
      lVar4 = CONCAT62(uStack_2ae,uStack_2b0);
      lVar15 = lVar4;
      if ((0xfff < uStack_298 * 2 + 2) &&
         (lVar15 = *(longlong *)(lVar4 + -8), 0x1f < (lVar4 - lVar15) - 8U)) {
        puStack_368 = (undefined8 *)0x0;
        _invoke_watson(0,0,0,0);
        pcVar1 = (code *)swi(3);
        (*pcVar1)();
        return;
      }
      _aligned_free(lVar15);
    }
    uStack_2a0 = _DAT_181dbc8c0;
    uStack_298 = _UNK_181dbc8c8;
    uStack_2b0 = 0;
  }
  uVar8 = _UNK_181dbc8c8;
  uVar11 = _DAT_181dbc8c0;
  if (bVar6) {
    if (7 < uStack_308) {
      lVar4 = CONCAT44(uStack_31c,CONCAT22(uStack_31e,uStack_320));
      lVar15 = lVar4;
      if ((0xfff < uStack_308 * 2 + 2) &&
         (lVar15 = *(longlong *)(lVar4 + -8), 0x1f < (lVar4 - lVar15) - 8U)) {
        puStack_368 = (undefined8 *)0x0;
        _invoke_watson(0,0,0,0);
        pcVar1 = (code *)swi(3);
        (*pcVar1)();
        return;
      }
      _aligned_free(lVar15);
    }
    uStack_310 = uVar11;
    uStack_308 = uVar8;
    uStack_320 = 0;
  }
  if (7 < uStack_2b8) {
    lVar4 = CONCAT62(uStack_2ce,uStack_2d0);
    lVar15 = lVar4;
    if ((0xfff < uStack_2b8 * 2 + 2) &&
       (lVar15 = *(longlong *)(lVar4 + -8), 0x1f < (lVar4 - lVar15) - 8U)) {
      puStack_368 = (undefined8 *)0x0;
      _invoke_watson(0,0,0,0);
      pcVar1 = (code *)swi(3);
      (*pcVar1)();
      return;
    }
    _aligned_free(lVar15);
  }
  uStack_2b8 = uVar8;
  uStack_2c0 = uVar11;
  uStack_2d0 = 0;
  if (7 < uStack_2e8) {
    lVar4 = CONCAT62(uStack_2fe,uStack_300);
    lVar15 = lVar4;
    if ((0xfff < uStack_2e8 * 2 + 2) &&
       (lVar15 = *(longlong *)(lVar4 + -8), 0x1f < (lVar4 - lVar15) - 8U)) {
      puStack_368 = (undefined8 *)0x0;
      _invoke_watson(0,0,0,0);
      pcVar1 = (code *)swi(3);
      (*pcVar1)();
      return;
    }
    _aligned_free(lVar15);
  }
  uStack_2e8 = uVar8;
  uStack_2f0 = uVar11;
  uStack_300 = 0;
  if (bVar7) {
    uStack_320 = 0xc011;
    uStack_31e = 0xc612;
    uStack_31c = 0xf25457a8;
    uStack_318 = 0xf75400c3;
    uStack_314 = 0x326fe941;
    uStack_310 = 0x5947d6158090266b;
    uStack_308 = 0x987f8022906eca49;
    func_0x000180c03b70(auStack_200,0,0,0x20);
    func_0x000180c03b80(auStack_200,&UNK_181cf7964,6);
    func_0x000180c03b80(auStack_200,&UNK_181cf796c,6);
    func_0x000180c03b80(auStack_200,&UNK_181cf7974,5);
    func_0x000180c03b60(auStack_200,auStack_290,0x20);
    uVar9 = FUN_180f9bbb4();
    puStack_340 = (undefined8 *)&UNK_181cf7af0;
    uStack_338 = 7;
    FUN_18014a5d0(&uStack_300,uVar9,&puStack_340);
    uVar12 = FUN_18014ae00(param_2,&uStack_2d0);
    puStack_340 = (undefined8 *)&uStack_300;
    if (7 < uStack_2e8) {
      puStack_340 = (undefined8 *)CONCAT62(uStack_2fe,uStack_300);
    }
    uStack_338 = uStack_2f0;
    iVar10 = FUN_18014ab10(uVar12,&puStack_340);
    if (7 < uStack_2b8) {
      lVar4 = CONCAT62(uStack_2ce,uStack_2d0);
      lVar15 = lVar4;
      if ((0xfff < uStack_2b8 * 2 + 2) &&
         (lVar15 = *(longlong *)(lVar4 + -8), 0x1f < (lVar4 - lVar15) - 8U)) {
        puStack_368 = (undefined8 *)0x0;
        _invoke_watson(0,0,0,0);
        pcVar1 = (code *)swi(3);
        (*pcVar1)();
        return;
      }
      _aligned_free(lVar15);
    }
    uStack_2c0 = uVar11;
    uStack_2b8 = uVar8;
    uStack_2d0 = 0;
    if (7 < uStack_2e8) {
      lVar4 = CONCAT62(uStack_2fe,uStack_300);
      lVar15 = lVar4;
      if ((0xfff < uStack_2e8 * 2 + 2) &&
         (lVar15 = *(longlong *)(lVar4 + -8), 0x1f < (lVar4 - lVar15) - 8U)) {
        puStack_368 = (undefined8 *)0x0;
        _invoke_watson(0,0,0,0);
        pcVar1 = (code *)swi(3);
        (*pcVar1)();
        return;
      }
      _aligned_free(lVar15);
    }
    uStack_2f0 = uVar11;
    uStack_2e8 = uVar8;
    uStack_300 = 0;
    if (iVar10 == 0) {
      puStack_368 = (undefined8 *)&uStack_320;
      FUN_180153600(&puStack_340,&uStack_320,&uStack_300,auStack_290);
    }
    if (_DAT_182060ad8 != (code *)0x0) {
      (*_DAT_182060ad8)(0xa8);
    }
    puVar13 = (undefined8 *)_aligned_malloc(0xa8,0x10);
    puStack_340 = puVar13;
    if (puVar13 != (undefined8 *)0x0) {
      FUN_180156200(&uStack_2b0,param_2);
      puVar14 = (undefined8 *)FUN_1805e1260(alStack_270,&uStack_2b0,&uStack_320);
      *(undefined4 *)(puVar13 + 1) = 1;
      *puVar13 = &UNK_181cf7f18;
      puVar13[2] = 0;
      puVar13[3] = 0;
      puVar13[4] = 0;
      puVar13[5] = 0;
      uVar11 = puVar14[1];
      puVar13[2] = *puVar14;
      puVar13[3] = uVar11;
      uVar11 = puVar14[3];
      puVar13[4] = puVar14[2];
      puVar13[5] = uVar11;
      *(undefined2 *)puVar14 = 0;
      puVar14[2] = 0;
      puVar14[3] = 7;
      puVar13[6] = puVar14[4];
      uVar9 = *(undefined4 *)((longlong)puVar14 + 0x2c);
      uVar2 = *(undefined4 *)(puVar14 + 6);
      uVar3 = *(undefined4 *)((longlong)puVar14 + 0x34);
      *(undefined4 *)(puVar13 + 7) = *(undefined4 *)(puVar14 + 5);
      *(undefined4 *)((longlong)puVar13 + 0x3c) = uVar9;
      *(undefined4 *)(puVar13 + 8) = uVar2;
      *(undefined4 *)((longlong)puVar13 + 0x44) = uVar3;
      uVar9 = *(undefined4 *)((longlong)puVar14 + 0x3c);
      uVar2 = *(undefined4 *)(puVar14 + 8);
      uVar3 = *(undefined4 *)((longlong)puVar14 + 0x44);
      *(undefined4 *)(puVar13 + 9) = *(undefined4 *)(puVar14 + 7);
      *(undefined4 *)((longlong)puVar13 + 0x4c) = uVar9;
      *(undefined4 *)(puVar13 + 10) = uVar2;
      *(undefined4 *)((longlong)puVar13 + 0x54) = uVar3;
      *(undefined1 *)(puVar13 + 0xb) = *(undefined1 *)(puVar14 + 9);
      *(undefined1 *)(puVar13 + 0xc) = *(undefined1 *)(puVar14 + 10);
      puVar13[0xd] = puVar14[0xb];
      puVar13[0xe] = puVar14[0xc];
      puVar13[0xf] = puVar14[0xd];
      puVar14[0xb] = 0;
      puVar14[0xd] = 0;
      puVar14[0xc] = 0;
      *(undefined1 *)(puVar13 + 0x10) = 1;
      FUN_180960f70(puVar13 + 0x11);
      FUN_180158670(auStack_218);
      if (7 < uStack_258) {
        lVar15 = alStack_270[0];
        if ((0xfff < uStack_258 * 2 + 2) &&
           (lVar15 = *(longlong *)(alStack_270[0] + -8), 0x1f < (alStack_270[0] - lVar15) - 8U)) {
          puStack_368 = (undefined8 *)0x0;
          _invoke_watson(0,0,0,0);
          pcVar1 = (code *)swi(3);
          (*pcVar1)();
          return;
        }
        _aligned_free(lVar15);
      }
    }
  }
  else {
    if (_DAT_182060ad8 != (code *)0x0) {
      (*_DAT_182060ad8)(0xa8);
    }
    puVar13 = (undefined8 *)_aligned_malloc(0xa8,0x10);
    puStack_340 = puVar13;
    if (puVar13 != (undefined8 *)0x0) {
      FUN_180156200(&uStack_2d0,param_2);
      FUN_180166150(puVar13,&uStack_2d0);
    }
  }
  FUN_180f9eb40(uStack_78 ^ (ulonglong)auStack_388);
  return;
}


// FUNCTION 180166150

undefined8 * FUN_180166150(undefined8 *param_1,longlong *param_2)

{
  longlong lVar1;
  code *pcVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  undefined8 *puVar5;
  longlong lVar6;
  
  *(undefined4 *)(param_1 + 1) = 1;
  *param_1 = &UNK_181cf7f18;
  param_1[2] = 0;
  param_1[3] = 0;
  param_1[4] = 0;
  param_1[5] = 0;
  uVar3 = *(undefined4 *)((longlong)param_2 + 4);
  lVar1 = param_2[1];
  uVar4 = *(undefined4 *)((longlong)param_2 + 0xc);
  *(int *)(param_1 + 2) = (int)*param_2;
  *(undefined4 *)((longlong)param_1 + 0x14) = uVar3;
  *(int *)(param_1 + 3) = (int)lVar1;
  *(undefined4 *)((longlong)param_1 + 0x1c) = uVar4;
  uVar3 = *(undefined4 *)((longlong)param_2 + 0x14);
  lVar1 = param_2[3];
  uVar4 = *(undefined4 *)((longlong)param_2 + 0x1c);
  *(int *)(param_1 + 4) = (int)param_2[2];
  *(undefined4 *)((longlong)param_1 + 0x24) = uVar3;
  *(int *)(param_1 + 5) = (int)lVar1;
  *(undefined4 *)((longlong)param_1 + 0x2c) = uVar4;
  *(undefined2 *)param_2 = 0;
  param_2[2] = 0;
  param_2[3] = 7;
  *(undefined1 *)(param_1 + 0x10) = 0;
  FUN_180960f70(param_1 + 0x11);
  if (7 < (ulonglong)param_2[3]) {
    lVar1 = *param_2;
    lVar6 = lVar1;
    if ((0xfff < param_2[3] * 2 + 2U) &&
       (lVar6 = *(longlong *)(lVar1 + -8), 0x1f < (lVar1 - lVar6) - 8U)) {
      _invoke_watson(0,0,0,0,0);
      pcVar2 = (code *)swi(3);
      puVar5 = (undefined8 *)(*pcVar2)();
      return puVar5;
    }
    _aligned_free(lVar6);
  }
  param_2[2] = 0;
  param_2[3] = 7;
  *(undefined2 *)param_2 = 0;
  return param_1;
}


// FUNCTION 1805e1cc0

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_1805e1cc0(undefined8 *param_1,longlong *param_2,undefined8 param_3,undefined8 *param_4)

{
  longlong *plVar1;
  undefined8 *puVar2;
  char cVar3;
  longlong lVar4;
  undefined4 *puVar5;
  longlong lVar6;
  undefined1 auStack_98 [32];
  undefined8 uStack_78;
  longlong lStack_68;
  longlong lStack_60;
  longlong lStack_58;
  undefined4 uStack_50;
  undefined4 uStack_4c;
  undefined8 uStack_48;
  ulonglong uStack_40;
  
  uStack_40 = _DAT_181f8ca80 ^ (ulonglong)auStack_98;
  lStack_68 = param_1[0xb];
  lStack_58 = param_1[0xc] * 0x30 + lStack_68;
  uStack_78 = param_3;
  FUN_1805e3640(param_1 + 10,&uStack_50,&lStack_68,&lStack_58);
  lVar6 = param_1[0xc] * 0x30 + param_1[0xb];
  lVar4 = CONCAT44(uStack_4c,uStack_50);
  if (lVar4 != lVar6) {
    cVar3 = FUN_1805e1120(param_1 + 10,param_3,lVar4);
    if (cVar3 != '\0') {
      lVar4 = lVar6;
    }
  }
  if (lVar4 == param_1[0xc] * 0x30 + param_1[0xb]) {
    uStack_50 = 2;
    uStack_48 = 0x181f906c0;
    *param_4 = CONCAT44(uStack_4c,2);
    param_4[1] = 0x181f906c0;
    *param_2 = 0;
    param_2[1] = 0;
    param_2[2] = 0;
    param_2[3] = 0;
    param_2[4] = 0;
    param_2[5] = 0;
    param_2[6] = 0;
    param_2[7] = 0;
    *(undefined1 *)(param_2 + 7) = 1;
    param_2[8] = 0;
    param_2[9] = 0;
  }
  else {
    lStack_68 = *(longlong *)(lVar4 + 0x20);
    lStack_60 = *(longlong *)(lVar4 + 0x28);
    plVar1 = param_1 + 4;
    if (*plVar1 == 0) {
      mbstowcs(&uStack_50,&UNK_181cfa524,5);
      if (7 < (ulonglong)param_1[3]) {
        param_1 = (undefined8 *)*param_1;
      }
      lVar4 = _wfopen(param_1,&uStack_50);
      *param_2 = lVar4;
      param_2[1] = 0;
      if (lVar4 == 0) {
        puVar5 = (undefined4 *)_errno();
        uStack_50 = *puVar5;
        uStack_48 = 0x181f906d0;
        *param_4 = CONCAT44(uStack_4c,uStack_50);
        param_4[1] = 0x181f906d0;
      }
      *(undefined1 *)(param_2 + 7) = 1;
    }
    else {
      puVar2 = param_1 + 5;
      mbstowcs();
      if (7 < (ulonglong)param_1[3]) {
        param_1 = (undefined8 *)*param_1;
      }
      lVar4 = _wfopen(param_1,&uStack_50);
      if (lVar4 == 0) {
        puVar5 = (undefined4 *)_errno();
        uStack_50 = *puVar5;
        uStack_48 = 0x181f906d0;
        *param_4 = CONCAT44(uStack_4c,uStack_50);
        param_4[1] = 0x181f906d0;
      }
      *param_2 = lVar4;
      param_2[1] = 0;
      param_2[2] = *plVar1;
      func_0x000180fa0258(param_2 + 3,puVar2,0x20);
      *(undefined1 *)(param_2 + 7) = 2;
    }
    param_2[8] = lStack_68;
    param_2[9] = lStack_60;
  }
  FUN_180f9eb40(uStack_40 ^ (ulonglong)auStack_98);
  return;
}


