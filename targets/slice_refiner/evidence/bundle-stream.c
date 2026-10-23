// FUNCTION 180169c10

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_180169c10(undefined8 *param_1,longlong param_2)

{
  undefined4 *puVar1;
  code *pcVar2;
  int iVar3;
  longlong *plVar4;
  undefined8 *puVar5;
  undefined4 *puVar6;
  int iVar7;
  longlong lVar8;
  undefined1 auStack_138 [32];
  undefined8 uStack_118;
  longlong lStack_108;
  longlong lStack_100;
  longlong lStack_f8;
  undefined4 uStack_f0;
  undefined4 uStack_ec;
  undefined4 uStack_e8;
  undefined4 uStack_e4;
  longlong lStack_e0;
  longlong lStack_d8;
  undefined1 uStack_d0;
  longlong lStack_c8;
  longlong lStack_c0;
  char cStack_b8;
  undefined4 uStack_a8;
  undefined4 uStack_a4;
  undefined8 uStack_a0;
  longlong alStack_98 [3];
  ulonglong uStack_80;
  undefined1 auStack_78 [80];
  ulonglong uStack_28;
  
  uStack_28 = _DAT_181f8ca80 ^ (ulonglong)auStack_138;
  if (*(char *)(param_2 + 0x70) == -1) {
LAB_180169ebe:
    FUN_18015db00();
    pcVar2 = (code *)swi(3);
    (*pcVar2)();
    return;
  }
  if (*(char *)(param_2 + 0x70) == '\0') {
    puVar5 = (undefined8 *)FUN_18014af50(alStack_98,param_2,param_1[2]);
    puVar1 = (undefined4 *)param_1[1];
    mbstowcs(&uStack_a8,&UNK_181cfa524,5);
    if (7 < (ulonglong)puVar5[3]) {
      puVar5 = (undefined8 *)*puVar5;
    }
    lStack_108 = _wfopen(puVar5,&uStack_a8);
    lVar8 = 0x181f906d0;
    if (lStack_108 == 0) {
      puVar6 = (undefined4 *)_errno();
      *puVar1 = *puVar6;
      puVar1[1] = uStack_a4;
      puVar1[2] = 0x81f906d0;
      puVar1[3] = 1;
    }
    lStack_100 = 0;
    cStack_b8 = '\x01';
    uStack_a8 = 0;
    uStack_a0 = 0x181f906d0;
    FUN_180166e60(*param_1,&lStack_108);
    if (cStack_b8 != -1) {
      if (cStack_b8 == '\0') {
        FUN_18016a3c0(&lStack_108);
      }
      else {
        uStack_a8 = 0;
        uStack_a0 = 0x181f906d0;
        iVar7 = 0;
        if (lStack_108 != 0) {
          iVar3 = fclose();
          lStack_108 = 0;
          lStack_100 = 0;
          iVar7 = 0;
          if (iVar3 != 0) {
            iVar7 = 0x1c;
            uStack_a8 = 0x1c;
            lVar8 = 0x181f906c0;
            uStack_a0 = 0x181f906c0;
          }
        }
        if ((*(longlong *)(lVar8 + 8) != _DAT_181f906d8) || (iVar7 != 0)) {
          FUN_18014a1c0(auStack_78,&uStack_a8);
          func_0x000180fa0288(auStack_78,&UNK_181f7a360);
          goto LAB_180169ebe;
        }
      }
    }
    if (7 < uStack_80) {
      lVar8 = alStack_98[0];
      if ((0xfff < uStack_80 * 2 + 2) &&
         (lVar8 = *(longlong *)(alStack_98[0] + -8), 0x1f < (alStack_98[0] - lVar8) - 8U)) {
        uStack_118 = 0;
        _invoke_watson(0,0,0,0);
        pcVar2 = (code *)swi(3);
        (*pcVar2)();
        return;
      }
      _aligned_free(lVar8);
    }
  }
  else {
    plVar4 = (longlong *)FUN_1805e1cc0(param_2,auStack_78,param_1[5],param_1[4]);
    if ((char)plVar4[7] == '\x01') {
      lStack_108 = *plVar4;
      *plVar4 = 0;
      lStack_100 = plVar4[1];
      plVar4[1] = 0;
      uStack_d0 = 1;
    }
    else {
      lStack_108 = *plVar4;
      *plVar4 = 0;
      lStack_100 = plVar4[1];
      plVar4[1] = 0;
      lStack_f8 = plVar4[2];
      uStack_f0 = (undefined4)plVar4[3];
      uStack_ec = *(undefined4 *)((longlong)plVar4 + 0x1c);
      uStack_e8 = (undefined4)plVar4[4];
      uStack_e4 = *(undefined4 *)((longlong)plVar4 + 0x24);
      lStack_e0 = plVar4[5];
      lStack_d8 = plVar4[6];
      uStack_d0 = 2;
    }
    lStack_c8 = plVar4[8];
    lStack_c0 = plVar4[9];
    cStack_b8 = '\0';
    FUN_180166e60(param_1[3],&lStack_108);
    FUN_18016a170(&lStack_108);
    FUN_18016a3c0(auStack_78);
  }
  FUN_180f9eb40(uStack_28 ^ (ulonglong)auStack_138);
  return;
}


// FUNCTION 1801696b0

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_1801696b0(undefined8 *param_1,longlong param_2)

{
  code *pcVar1;
  undefined8 *puVar2;
  longlong lVar3;
  undefined1 auStack_88 [32];
  undefined8 uStack_68;
  undefined1 auStack_58 [32];
  longlong alStack_38 [3];
  ulonglong uStack_20;
  ulonglong uStack_18;
  
  uStack_18 = _DAT_181f8ca80 ^ (ulonglong)auStack_88;
  if (*(char *)(param_2 + 0x70) == -1) {
    FUN_18015db00();
    pcVar1 = (code *)swi(3);
    (*pcVar1)();
    return;
  }
  if (*(char *)(param_2 + 0x70) == '\0') {
    puVar2 = (undefined8 *)FUN_18014af50(alStack_38,param_2,*param_1);
    if (7 < (ulonglong)puVar2[3]) {
      puVar2 = (undefined8 *)*puVar2;
    }
    FUN_180f9c3d8(puVar2,auStack_58,3,0xffffffff);
    if (7 < uStack_20) {
      lVar3 = alStack_38[0];
      if ((0xfff < uStack_20 * 2 + 2) &&
         (lVar3 = *(longlong *)(alStack_38[0] + -8), 0x1f < (alStack_38[0] - lVar3) - 8U)) {
        uStack_68 = 0;
        _invoke_watson(0,0,0,0);
        pcVar1 = (code *)swi(3);
        (*pcVar1)();
        return;
      }
      _aligned_free(lVar3);
    }
  }
  else {
    FUN_1805e13e0(param_2,param_1[1]);
  }
  FUN_180f9eb40(uStack_18 ^ (ulonglong)auStack_88);
  return;
}


// FUNCTION 180169830

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_180169830(undefined8 *param_1,longlong param_2)

{
  undefined8 uVar1;
  code *pcVar2;
  undefined8 *puVar3;
  longlong lVar4;
  undefined1 auStack_a8 [32];
  undefined8 uStack_88;
  longlong lStack_78;
  longlong lStack_70;
  longlong lStack_68;
  undefined1 auStack_60 [32];
  longlong alStack_40 [3];
  ulonglong uStack_28;
  ulonglong uStack_20;
  
  uStack_20 = _DAT_181f8ca80 ^ (ulonglong)auStack_a8;
  if (*(char *)(param_2 + 0x70) == -1) {
    FUN_18015db00();
    pcVar2 = (code *)swi(3);
    (*pcVar2)();
    return;
  }
  if (*(char *)(param_2 + 0x70) == '\0') {
    puVar3 = (undefined8 *)FUN_18014af50(alStack_40,param_2,*param_1);
    if (7 < (ulonglong)puVar3[3]) {
      puVar3 = (undefined8 *)*puVar3;
    }
    FUN_180f9c3d8(puVar3,auStack_60,3,0xffffffff);
    if (7 < uStack_28) {
      lVar4 = alStack_40[0];
      if ((0xfff < uStack_28 * 2 + 2) &&
         (lVar4 = *(longlong *)(alStack_40[0] + -8), 0x1f < (alStack_40[0] - lVar4) - 8U)) {
        uStack_88 = 0;
        _invoke_watson(0,0,0,0);
        pcVar2 = (code *)swi(3);
        (*pcVar2)();
        return;
      }
      _aligned_free(lVar4);
    }
  }
  else {
    uVar1 = param_1[1];
    lStack_70 = *(longlong *)(param_2 + 0x58);
    lStack_78 = *(longlong *)(param_2 + 0x60) * 0x30 + lStack_70;
    uStack_88 = uVar1;
    FUN_1805e3640(param_2 + 0x50,&lStack_68,&lStack_70,&lStack_78);
    if (lStack_68 != *(longlong *)(param_2 + 0x60) * 0x30 + *(longlong *)(param_2 + 0x58)) {
      FUN_1805e1120(param_2 + 0x50,uVar1,lStack_68);
    }
  }
  FUN_180f9eb40(uStack_20 ^ (ulonglong)auStack_a8);
  return;
}


