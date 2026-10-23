// FUNCTION 180166230

longlong FUN_180166230(longlong param_1,ulonglong param_2)

{
  code *pcVar1;
  longlong lVar2;
  longlong lVar3;
  
  if (0xf < *(ulonglong *)(param_1 + 0xa0)) {
    lVar2 = *(longlong *)(param_1 + 0x88);
    lVar3 = lVar2;
    if ((0xfff < *(ulonglong *)(param_1 + 0xa0) + 1) &&
       (lVar3 = *(longlong *)(lVar2 + -8), 0x1f < (lVar2 - lVar3) - 8U)) goto LAB_180166323;
    _aligned_free(lVar3);
  }
  *(undefined8 *)(param_1 + 0x98) = 0;
  *(undefined8 *)(param_1 + 0xa0) = 0xf;
  *(undefined1 *)(param_1 + 0x88) = 0;
  if (*(char *)(param_1 + 0x80) != -1) {
    if (*(char *)(param_1 + 0x80) != '\0') {
      FUN_180158670(param_1 + 0x68);
    }
    if (7 < *(ulonglong *)(param_1 + 0x28)) {
      lVar2 = *(longlong *)(param_1 + 0x10);
      lVar3 = lVar2;
      if ((0xfff < *(ulonglong *)(param_1 + 0x28) * 2 + 2) &&
         (lVar3 = *(longlong *)(lVar2 + -8), 0x1f < (lVar2 - lVar3) - 8U)) {
LAB_180166323:
        _invoke_watson(0,0,0,0,0);
        pcVar1 = (code *)swi(3);
        lVar2 = (*pcVar1)();
        return lVar2;
      }
      _aligned_free(lVar3);
    }
    *(undefined2 *)(param_1 + 0x10) = 0;
    *(undefined8 *)(param_1 + 0x28) = 7;
    *(undefined8 *)(param_1 + 0x20) = 0;
  }
  if ((param_2 & 1) != 0) {
    _aligned_free(param_1);
  }
  return param_1;
}


// FUNCTION 180166410

longlong * FUN_180166410(longlong param_1)

{
  longlong *plVar1;
  
  plVar1 = (longlong *)(param_1 + 0x88);
  if (0xf < *(ulonglong *)(param_1 + 0xa0)) {
    plVar1 = (longlong *)*plVar1;
  }
  return plVar1;
}


// FUNCTION 180166430

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_180166430(longlong param_1,longlong *param_2)

{
  code *pcVar1;
  longlong lVar2;
  undefined1 auStack_78 [32];
  undefined8 uStack_58;
  longlong *plStack_48;
  longlong *plStack_40;
  longlong alStack_38 [3];
  ulonglong uStack_20;
  ulonglong uStack_18;
  
  uStack_18 = _DAT_181f8ca80 ^ (ulonglong)auStack_78;
  plStack_40 = (longlong *)0xffffffffffffffff;
  do {
    plStack_40 = (longlong *)((longlong)plStack_40 + 1);
  } while (*(char *)((longlong)param_2 + (longlong)plStack_40) != '\0');
  plStack_48 = param_2;
  FUN_1809610a0(alStack_38,&plStack_48);
  plStack_48 = alStack_38;
  plStack_40 = alStack_38;
  FUN_1801696b0(&plStack_48,param_1 + 0x10);
  if (7 < uStack_20) {
    lVar2 = alStack_38[0];
    if (0xfff < uStack_20 * 2 + 2) {
      lVar2 = *(longlong *)(alStack_38[0] + -8);
      if (0x1f < (alStack_38[0] - lVar2) - 8U) {
        uStack_58 = 0;
        _invoke_watson(0,0,0,0);
        pcVar1 = (code *)swi(3);
        (*pcVar1)();
        return;
      }
    }
    _aligned_free(lVar2);
  }
  FUN_180f9eb40(uStack_18 ^ (ulonglong)auStack_78);
  return;
}


// FUNCTION 180166510

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_180166510(longlong param_1,longlong *param_2)

{
  code *pcVar1;
  longlong lVar2;
  undefined1 auStack_78 [32];
  undefined8 uStack_58;
  longlong *plStack_48;
  longlong *plStack_40;
  longlong alStack_38 [3];
  ulonglong uStack_20;
  ulonglong uStack_18;
  
  uStack_18 = _DAT_181f8ca80 ^ (ulonglong)auStack_78;
  plStack_40 = (longlong *)0xffffffffffffffff;
  do {
    plStack_40 = (longlong *)((longlong)plStack_40 + 1);
  } while (*(char *)((longlong)param_2 + (longlong)plStack_40) != '\0');
  plStack_48 = param_2;
  FUN_1809610a0(alStack_38,&plStack_48);
  plStack_48 = alStack_38;
  plStack_40 = alStack_38;
  FUN_180169830(&plStack_48,param_1 + 0x10);
  if (7 < uStack_20) {
    lVar2 = alStack_38[0];
    if (0xfff < uStack_20 * 2 + 2) {
      lVar2 = *(longlong *)(alStack_38[0] + -8);
      if (0x1f < (alStack_38[0] - lVar2) - 8U) {
        uStack_58 = 0;
        _invoke_watson(0,0,0,0);
        pcVar1 = (code *)swi(3);
        (*pcVar1)();
        return;
      }
    }
    _aligned_free(lVar2);
  }
  FUN_180f9eb40(uStack_18 ^ (ulonglong)auStack_78);
  return;
}


// FUNCTION 1801665f0

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_1801665f0(longlong param_1,longlong param_2)

{
  code *pcVar1;
  undefined8 *puVar2;
  longlong lVar3;
  undefined1 auStack_a8 [32];
  undefined8 uStack_88;
  longlong lStack_78;
  longlong lStack_70;
  longlong alStack_58 [3];
  ulonglong uStack_40;
  longlong alStack_38 [3];
  ulonglong uStack_20;
  ulonglong uStack_18;
  
  uStack_18 = _DAT_181f8ca80 ^ (ulonglong)auStack_a8;
  lStack_70 = -1;
  do {
    lStack_70 = lStack_70 + 1;
  } while (*(char *)(param_2 + lStack_70) != '\0');
  lStack_78 = param_2;
  FUN_1809610a0(alStack_58,&lStack_78);
  if (*(char *)(param_1 + 0x80) == -1) {
    FUN_18015db00();
    pcVar1 = (code *)swi(3);
    (*pcVar1)();
    return;
  }
  if (*(char *)(param_1 + 0x80) == '\0') {
    puVar2 = (undefined8 *)FUN_18014af50(alStack_38,param_1 + 0x10,alStack_58);
    if (7 < (ulonglong)puVar2[3]) {
      puVar2 = (undefined8 *)*puVar2;
    }
    FUN_180f9c3d8(puVar2,&lStack_78,3,0xffffffff);
    if (7 < uStack_20) {
      lVar3 = alStack_38[0];
      if ((0xfff < uStack_20 * 2 + 2) &&
         (lVar3 = *(longlong *)(alStack_38[0] + -8), 0x1f < (alStack_38[0] - lVar3) - 8U)) {
        uStack_88 = 0;
        _invoke_watson(0,0,0,0);
        pcVar1 = (code *)swi(3);
        (*pcVar1)();
        return;
      }
      _aligned_free(lVar3);
    }
  }
  else {
    FUN_1805e1610(param_1 + 0x10,alStack_58);
  }
  if (7 < uStack_40) {
    lVar3 = alStack_58[0];
    if ((0xfff < uStack_40 * 2 + 2) &&
       (lVar3 = *(longlong *)(alStack_58[0] + -8), 0x1f < (alStack_58[0] - lVar3) - 8U)) {
      uStack_88 = 0;
      _invoke_watson(0,0,0,0);
      pcVar1 = (code *)swi(3);
      (*pcVar1)();
      return;
    }
    _aligned_free(lVar3);
  }
  FUN_180f9eb40(uStack_18 ^ (ulonglong)auStack_a8);
  return;
}


// FUNCTION 1801667f0

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_1801667f0(longlong param_1,undefined8 param_2,longlong *param_3)

{
  code *pcVar1;
  longlong lVar2;
  undefined1 auStack_78 [32];
  undefined8 uStack_58;
  longlong *plStack_48;
  longlong *plStack_40;
  longlong alStack_38 [3];
  ulonglong uStack_20;
  ulonglong uStack_18;
  
  uStack_18 = _DAT_181f8ca80 ^ (ulonglong)auStack_78;
  plStack_40 = (longlong *)0xffffffffffffffff;
  do {
    plStack_40 = (longlong *)((longlong)plStack_40 + 1);
  } while (*(char *)((longlong)param_3 + (longlong)plStack_40) != '\0');
  plStack_48 = param_3;
  FUN_1809610a0(alStack_38,&plStack_48);
  plStack_48 = alStack_38;
  plStack_40 = alStack_38;
  FUN_180169a10(param_2,&plStack_48,param_1 + 0x10);
  if (7 < uStack_20) {
    lVar2 = alStack_38[0];
    if ((0xfff < uStack_20 * 2 + 2) &&
       (lVar2 = *(longlong *)(alStack_38[0] + -8), 0x1f < (alStack_38[0] - lVar2) - 8U)) {
      uStack_58 = 0;
      _invoke_watson(0,0,0,0);
      pcVar1 = (code *)swi(3);
      (*pcVar1)();
      return;
    }
    _aligned_free(lVar2);
  }
  FUN_180f9eb40(uStack_18 ^ (ulonglong)auStack_78);
  return;
}


// FUNCTION 180166f80

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_180166f80(longlong param_1,longlong ****param_2,undefined8 *param_3)

{
  code *pcVar1;
  undefined8 *puVar2;
  longlong *****ppppplVar3;
  longlong lVar4;
  undefined8 *puVar5;
  undefined8 *puVar6;
  undefined1 auStack_c8 [32];
  undefined8 uStack_a8;
  longlong ***appplStack_98 [2];
  longlong ***ppplStack_88;
  longlong *plStack_80;
  longlong ****pppplStack_78;
  longlong ***ppplStack_70;
  longlong *plStack_68;
  longlong ***ppplStack_60;
  longlong ***ppplStack_58;
  longlong *plStack_50;
  longlong alStack_48 [3];
  ulonglong uStack_30;
  ulonglong uStack_28;
  
  uStack_28 = _DAT_181f8ca80 ^ (ulonglong)auStack_c8;
  puVar5 = (undefined8 *)0x0;
  appplStack_98[0] = (longlong ***)((ulonglong)appplStack_98[0] & 0xffffffff00000000);
  plStack_80 = (longlong *)0xffffffffffffffff;
  do {
    plStack_80 = (longlong *)((longlong)plStack_80 + 1);
  } while (*(char *)((longlong)param_2 + (longlong)plStack_80) != '\0');
  ppplStack_88 = (longlong ***)param_2;
  pppplStack_78 = param_2;
  ppplStack_70 = (longlong ***)plStack_80;
  FUN_1809610a0(alStack_48,&pppplStack_78);
  ppplStack_88 = (longlong ***)((ulonglong)ppplStack_88 & 0xffffffff00000000);
  plStack_80 = (longlong *)0x181f906d0;
  appplStack_98[0] = (longlong ***)0x0;
  pppplStack_78 = appplStack_98;
  ppplStack_70 = (longlong ***)&ppplStack_88;
  plStack_68 = alStack_48;
  ppplStack_60 = (longlong ***)appplStack_98;
  ppplStack_58 = (longlong ***)&ppplStack_88;
  plStack_50 = alStack_48;
  if (*(char *)(param_1 + 0x80) == -1) {
    FUN_18015db00();
    pcVar1 = (code *)swi(3);
    (*pcVar1)();
    return;
  }
  if (*(char *)(param_1 + 0x80) == '\0') {
    FUN_180167280(&pppplStack_78);
  }
  else {
    FUN_180167530(&ppplStack_60);
  }
  if ((param_3 == (undefined8 *)0x0) ||
     ((plStack_80[1] == _DAT_181f906d8 && ((int)ppplStack_88 == 0)))) {
    if ((plStack_80[1] == _DAT_181f906d8) && ((int)ppplStack_88 == 0)) {
      if (7 < uStack_30) {
        if ((0xfff < uStack_30 * 2 + 2) &&
           (0x1f < (alStack_48[0] - *(longlong *)(alStack_48[0] + -8)) - 8U)) goto LAB_180167252;
        _aligned_free();
      }
      goto LAB_1801671ed;
    }
    if ((longlong ****)appplStack_98[0] != (longlong ****)0x0) {
      (*(code *)(*appplStack_98[0])[2])();
    }
    if (uStack_30 < 8) goto LAB_1801671ed;
    lVar4 = alStack_48[0];
    if ((0xfff < uStack_30 * 2 + 2) &&
       (lVar4 = *(longlong *)(alStack_48[0] + -8), 0x1f < (alStack_48[0] - lVar4) - 8U)) {
LAB_180167252:
      uStack_a8 = 0;
      _invoke_watson(0,0,0,0);
      pcVar1 = (code *)swi(3);
      (*pcVar1)();
      return;
    }
  }
  else {
    if (_DAT_182060ad8 != (code *)0x0) {
      (*_DAT_182060ad8)(0x38);
    }
    puVar2 = (undefined8 *)_aligned_malloc(0x38,0x10);
    puVar6 = puVar5;
    if (puVar2 != (undefined8 *)0x0) {
      (**(code **)(*plStack_80 + 0x10))
                (plStack_80,&pppplStack_78,(ulonglong)ppplStack_88 & 0xffffffff);
      ppppplVar3 = &pppplStack_78;
      if ((longlong ****)0xf < ppplStack_60) {
        ppppplVar3 = (longlong *****)pppplStack_78;
      }
      *(undefined4 *)(puVar2 + 2) = 1;
      *puVar2 = &UNK_181d66270;
      puVar2[1] = &UNK_181d662b8;
      puVar2[3] = 0;
      puVar2[4] = 0;
      puVar2[5] = 0;
      puVar2[6] = 0;
      FUN_180148dd0(puVar2 + 3,ppppplVar3,plStack_68);
      puVar5 = puVar2;
      puVar6 = (undefined8 *)0x1;
    }
    *param_3 = puVar5;
    if ((puVar6 != (undefined8 *)0x0) && ((longlong ****)0xf < ppplStack_60)) {
      ppppplVar3 = (longlong *****)pppplStack_78;
      if ((0xfff < (longlong)ppplStack_60 + 1U) &&
         (ppppplVar3 = (longlong *****)pppplStack_78[-1],
         0x1f < (ulonglong)((longlong)pppplStack_78 + (-8 - (longlong)ppppplVar3)))) {
        uStack_a8 = 0;
        _invoke_watson(0,0,0,0);
        pcVar1 = (code *)swi(3);
        (*pcVar1)();
        return;
      }
      _aligned_free(ppppplVar3);
    }
    if (uStack_30 < 8) goto LAB_1801671ed;
    lVar4 = alStack_48[0];
    if (0xfff < uStack_30 * 2 + 2) {
      if (0x1f < (alStack_48[0] - *(longlong *)(alStack_48[0] + -8)) - 8U) goto LAB_180167252;
      _aligned_free();
      goto LAB_1801671ed;
    }
  }
  _aligned_free(lVar4);
LAB_1801671ed:
  FUN_180f9eb40(uStack_28 ^ (ulonglong)auStack_c8);
  return;
}


// FUNCTION 1801668e0

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_1801668e0(longlong param_1,longlong param_2,undefined8 *param_3)

{
  undefined8 uVar1;
  code *pcVar2;
  undefined1 uVar3;
  int iVar4;
  undefined8 *puVar5;
  undefined8 *puVar6;
  undefined8 *puVar7;
  longlong lVar8;
  int iVar9;
  undefined1 auStack_158 [32];
  undefined8 uStack_138;
  int aiStack_128 [2];
  longlong *plStack_120;
  longlong lStack_118;
  undefined8 uStack_110;
  undefined8 uStack_108;
  undefined4 uStack_100;
  undefined4 uStack_fc;
  undefined4 uStack_f8;
  undefined4 uStack_f4;
  undefined8 uStack_f0;
  undefined8 uStack_e8;
  char cStack_e0;
  undefined8 uStack_d8;
  undefined8 uStack_d0;
  char cStack_c8;
  longlong *plStack_b8;
  int *piStack_b0;
  longlong *plStack_a8;
  longlong *plStack_a0;
  int *piStack_98;
  longlong *plStack_90;
  undefined4 uStack_88;
  undefined8 uStack_78;
  longlong lStack_70;
  undefined8 uStack_68;
  ulonglong uStack_60;
  longlong alStack_58 [3];
  ulonglong uStack_40;
  ulonglong uStack_38;
  
  uStack_38 = _DAT_181f8ca80 ^ (ulonglong)auStack_158;
  puVar6 = (undefined8 *)0x0;
  iVar9 = 0;
  uStack_88 = 0;
  lStack_70 = -1;
  do {
    lStack_70 = lStack_70 + 1;
  } while (*(char *)(param_2 + lStack_70) != '\0');
  uStack_78._4_4_ = (uint)((ulonglong)param_2 >> 0x20);
  uStack_78._0_4_ = (undefined4)param_2;
  FUN_1809610a0(alStack_58,&uStack_78);
  aiStack_128[0] = 0;
  lVar8 = 0x181f906d0;
  plStack_120 = (longlong *)0x181f906d0;
  lStack_118 = 0;
  uStack_110 = 0;
  cStack_c8 = '\x01';
  uStack_78 = (undefined8 *)((ulonglong)uStack_78._4_4_ << 0x20);
  lStack_70 = 0x181f906d0;
  plStack_b8 = &lStack_118;
  piStack_b0 = aiStack_128;
  plStack_a0 = &lStack_118;
  piStack_98 = aiStack_128;
  plStack_a8 = alStack_58;
  plStack_90 = alStack_58;
  FUN_180169c10(&plStack_b8,param_1 + 0x10);
  if ((param_3 == (undefined8 *)0x0) ||
     ((plStack_120[1] == _DAT_181f906d8 && (aiStack_128[0] == 0)))) {
    iVar9 = 0;
    if ((plStack_120[1] == _DAT_181f906d8) && (aiStack_128[0] == 0)) {
      if (_DAT_182060ad8 != (code *)0x0) {
        (*_DAT_182060ad8)(0x68);
      }
      puVar6 = (undefined8 *)_aligned_malloc(0x68,0x10);
      if (puVar6 != (undefined8 *)0x0) {
        *(undefined4 *)(puVar6 + 1) = 1;
        *puVar6 = &UNK_181cfa530;
        *(undefined1 *)(puVar6 + 0xc) = 0xff;
        if (cStack_c8 != -1) {
          if (cStack_c8 == '\0') {
            *(undefined1 *)(puVar6 + 9) = 0;
            puVar6[2] = 0;
            puVar6[3] = 0;
            puVar6[2] = lStack_118;
            lStack_118 = 0;
            uVar1 = puVar6[3];
            puVar6[3] = uStack_110;
            if (cStack_e0 == '\x01') {
              uVar3 = 1;
            }
            else {
              puVar6[4] = uStack_108;
              *(undefined4 *)(puVar6 + 5) = uStack_100;
              *(undefined4 *)((longlong)puVar6 + 0x2c) = uStack_fc;
              *(undefined4 *)(puVar6 + 6) = uStack_f8;
              *(undefined4 *)((longlong)puVar6 + 0x34) = uStack_f4;
              puVar6[7] = uStack_f0;
              puVar6[8] = uStack_e8;
              uVar3 = 2;
            }
            *(undefined1 *)(puVar6 + 9) = uVar3;
            puVar6[10] = uStack_d8;
            puVar6[0xb] = uStack_d0;
            *(undefined1 *)(puVar6 + 0xc) = 0;
            uStack_110 = uVar1;
          }
          else {
            puVar6[2] = 0;
            puVar6[3] = 0;
            puVar6[2] = lStack_118;
            lStack_118 = 0;
            uVar1 = puVar6[3];
            puVar6[3] = uStack_110;
            *(undefined1 *)(puVar6 + 0xc) = 1;
            uStack_110 = uVar1;
          }
        }
      }
      if (cStack_c8 != -1) {
        if (cStack_c8 == '\0') {
          FUN_18016a3c0(&lStack_118);
        }
        else {
          uStack_78 = (undefined8 *)((ulonglong)uStack_78 & 0xffffffff00000000);
          lStack_70 = 0x181f906d0;
          if (lStack_118 != 0) {
            iVar4 = fclose();
            lStack_118 = 0;
            uStack_110 = 0;
            if (iVar4 != 0) {
              iVar9 = 0x1c;
              uStack_78 = (undefined8 *)CONCAT44(uStack_78._4_4_,0x1c);
              lVar8 = 0x181f906c0;
              lStack_70 = 0x181f906c0;
            }
          }
          if ((*(longlong *)(lVar8 + 8) != _DAT_181f906d8) || (iVar9 != 0)) goto LAB_180166e32;
        }
      }
      if (7 < uStack_40) {
        if ((uStack_40 * 2 + 2 < 0x1000) ||
           ((alStack_58[0] - *(longlong *)(alStack_58[0] + -8)) - 8U < 0x20)) {
          _aligned_free();
          goto LAB_180166dc1;
        }
        goto LAB_180166da0;
      }
      goto LAB_180166dc1;
    }
    if (cStack_c8 != -1) {
      if (cStack_c8 == '\0') {
        FUN_18016a3c0(&lStack_118);
      }
      else {
        uStack_78 = (undefined8 *)((ulonglong)uStack_78 & 0xffffffff00000000);
        lStack_70 = 0x181f906d0;
        if (lStack_118 != 0) {
          iVar4 = fclose(lStack_118);
          lStack_118 = 0;
          uStack_110 = 0;
          if (iVar4 != 0) {
            iVar9 = 0x1c;
            uStack_78 = (undefined8 *)CONCAT44(uStack_78._4_4_,0x1c);
            lVar8 = 0x181f906c0;
            lStack_70 = 0x181f906c0;
          }
        }
        if ((*(longlong *)(lVar8 + 8) != _DAT_181f906d8) || (iVar9 != 0)) {
          FUN_18014a1c0(&plStack_b8,&uStack_78);
          func_0x000180fa0288(&plStack_b8,&UNK_181f7a360);
          goto LAB_180166e0b;
        }
      }
    }
    if (uStack_40 < 8) goto LAB_180166dc1;
    if (0xfff < uStack_40 * 2 + 2) {
      lVar8 = alStack_58[0] - *(longlong *)(alStack_58[0] + -8);
      alStack_58[0] = *(longlong *)(alStack_58[0] + -8);
      goto joined_r0x000180166d9e;
    }
  }
  else {
    if (_DAT_182060ad8 != (code *)0x0) {
      (*_DAT_182060ad8)(0x38);
    }
    puVar5 = (undefined8 *)_aligned_malloc(0x38,0x10);
    puVar7 = puVar6;
    if (puVar5 != (undefined8 *)0x0) {
      (**(code **)(*plStack_120 + 0x10))(plStack_120,&uStack_78,aiStack_128[0]);
      puVar6 = &uStack_78;
      if (0xf < uStack_60) {
        puVar6 = uStack_78;
      }
      *(undefined4 *)(puVar5 + 2) = 1;
      *puVar5 = &UNK_181d66270;
      puVar5[1] = &UNK_181d662b8;
      puVar5[3] = 0;
      puVar5[4] = 0;
      puVar5[5] = 0;
      puVar5[6] = 0;
      FUN_180148dd0(puVar5 + 3,puVar6,uStack_68);
      puVar6 = puVar5;
      puVar7 = (undefined8 *)0x1;
    }
    *param_3 = puVar6;
    if (puVar7 != (undefined8 *)0x0) {
      FUN_180148980(&uStack_78);
    }
    if (cStack_c8 != -1) {
      if (cStack_c8 == '\0') {
        FUN_18016a3c0(&lStack_118);
      }
      else {
        uStack_78 = (undefined8 *)((ulonglong)uStack_78 & 0xffffffff00000000);
        lStack_70 = 0x181f906d0;
        if (lStack_118 != 0) {
          iVar4 = fclose();
          lStack_118 = 0;
          uStack_110 = 0;
          if (iVar4 != 0) {
            iVar9 = 0x1c;
            uStack_78 = (undefined8 *)CONCAT44(uStack_78._4_4_,0x1c);
            lVar8 = 0x181f906c0;
            lStack_70 = 0x181f906c0;
          }
        }
        if ((*(longlong *)(lVar8 + 8) != _DAT_181f906d8) || (iVar9 != 0)) {
LAB_180166e0b:
          FUN_18014a1c0(&plStack_b8,&uStack_78);
          func_0x000180fa0288(&plStack_b8,&UNK_181f7a360);
LAB_180166e32:
          FUN_18014a1c0(&plStack_b8,&uStack_78);
          func_0x000180fa0288(&plStack_b8,&UNK_181f7a360);
          pcVar2 = (code *)swi(3);
          (*pcVar2)();
          return;
        }
      }
    }
    if (uStack_40 < 8) goto LAB_180166dc1;
    if (0xfff < uStack_40 * 2 + 2) {
      lVar8 = alStack_58[0] - *(longlong *)(alStack_58[0] + -8);
      alStack_58[0] = *(longlong *)(alStack_58[0] + -8);
joined_r0x000180166d9e:
      if (0x1f < lVar8 - 8U) {
LAB_180166da0:
        uStack_138 = 0;
        _invoke_watson(0,0,0,0);
        pcVar2 = (code *)swi(3);
        (*pcVar2)();
        return;
      }
    }
  }
  _aligned_free(alStack_58[0]);
LAB_180166dc1:
  FUN_180f9eb40(uStack_38 ^ (ulonglong)auStack_158);
  return;
}


// FUNCTION 180169430

void FUN_180169430(longlong *param_1)

{
  if (param_1 != (longlong *)0x0) {
                    /* WARNING: Could not recover jumptable at 0x00018016943d. Too many branches */
                    /* WARNING: Treating indirect jump as call */
    (**(code **)(*param_1 + 0x58))(param_1,1);
    return;
  }
  return;
}


// FUNCTION 180167b20

undefined1 FUN_180167b20(longlong param_1,longlong param_2,longlong *param_3)

{
  if ((param_2 != 0) && (param_2 != 0x92b8d)) {
    *param_3 = 0;
    return 0;
  }
  *param_3 = param_1;
  LOCK();
  *(int *)(param_1 + 8) = *(int *)(param_1 + 8) + 1;
  UNLOCK();
  return 1;
}


