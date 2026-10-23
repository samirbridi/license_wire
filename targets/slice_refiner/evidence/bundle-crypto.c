// FUNCTION 180153600

undefined8 *
FUN_180153600(undefined8 *param_1,uint *param_2,uint *param_3,uint *param_4,uint *param_5)

{
  uint uVar1;
  uint uVar2;
  uint uVar3;
  uint uVar4;
  uint uVar5;
  uint uVar6;
  uint uVar7;
  uint uVar8;
  uint uVar9;
  uint uVar10;
  uint uVar11;
  uint *puVar12;
  ulonglong uVar13;
  longlong lVar14;
  ulonglong uVar15;
  
  uVar13 = 0;
  uVar15 = (longlong)param_3 - (longlong)param_2;
  if (param_3 < param_2) {
    uVar15 = uVar13;
  }
  if ((((uVar15 != 0) && (0x3f < uVar15)) &&
      ((puVar12 = (uint *)((longlong)param_5 + (uVar15 - 1)),
       (uint *)((longlong)param_4 + (uVar15 - 1)) < param_5 || (puVar12 < param_4)))) &&
     (((uint *)((longlong)param_2 + (uVar15 - 1)) < param_5 || (puVar12 < param_2)))) {
    do {
      uVar11 = param_4[1];
      uVar1 = param_4[2];
      uVar2 = param_4[3];
      uVar13 = uVar13 + 0x40;
      uVar3 = param_2[1];
      uVar4 = param_2[2];
      uVar5 = param_2[3];
      uVar6 = param_2[4];
      uVar7 = param_2[5];
      uVar8 = param_2[6];
      uVar9 = param_2[7];
      *param_5 = *param_2 ^ *param_4;
      param_5[1] = uVar3 ^ uVar11;
      param_5[2] = uVar4 ^ uVar1;
      param_5[3] = uVar5 ^ uVar2;
      uVar11 = param_4[5];
      uVar1 = param_4[6];
      uVar2 = param_4[7];
      uVar3 = param_2[8];
      uVar4 = param_2[9];
      uVar5 = param_2[10];
      uVar10 = param_2[0xb];
      param_5[4] = param_4[4] ^ uVar6;
      param_5[5] = uVar11 ^ uVar7;
      param_5[6] = uVar1 ^ uVar8;
      param_5[7] = uVar2 ^ uVar9;
      uVar11 = param_4[9];
      uVar1 = param_4[10];
      uVar2 = param_4[0xb];
      uVar6 = param_2[0xc];
      uVar7 = param_2[0xd];
      uVar8 = param_2[0xe];
      uVar9 = param_2[0xf];
      param_2 = param_2 + 0x10;
      param_5[8] = param_4[8] ^ uVar3;
      param_5[9] = uVar11 ^ uVar4;
      param_5[10] = uVar1 ^ uVar5;
      param_5[0xb] = uVar2 ^ uVar10;
      puVar12 = param_4 + 0xc;
      uVar11 = param_4[0xd];
      uVar1 = param_4[0xe];
      uVar2 = param_4[0xf];
      param_4 = param_4 + 0x10;
      param_5[0xc] = *puVar12 ^ uVar6;
      param_5[0xd] = uVar11 ^ uVar7;
      param_5[0xe] = uVar1 ^ uVar8;
      param_5[0xf] = uVar2 ^ uVar9;
      param_5 = param_5 + 0x10;
    } while (uVar13 != (uVar15 & 0xffffffffffffffc0));
  }
  if (param_2 != param_3) {
    lVar14 = (longlong)param_4 - (longlong)param_5;
    do {
      uVar11 = *param_2;
      param_2 = (uint *)((longlong)param_2 + 1);
      *(byte *)param_5 = *(byte *)(lVar14 + (longlong)param_5) ^ (byte)uVar11;
      param_5 = (uint *)((longlong)param_5 + 1);
    } while (param_2 != param_3);
  }
  *param_1 = param_5;
  return param_1;
}


// FUNCTION 1805e1260

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_1805e1260(undefined8 *param_1,longlong *param_2,undefined8 param_3)

{
  longlong lVar1;
  code *pcVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  longlong lVar5;
  undefined1 auStack_a8 [32];
  undefined8 uStack_88;
  int iStack_78;
  undefined4 uStack_74;
  undefined8 uStack_70;
  undefined8 *puStack_68;
  int iStack_58;
  undefined4 uStack_54;
  undefined4 uStack_50;
  undefined4 uStack_4c;
  undefined1 auStack_48 [40];
  longlong *plStack_20;
  ulonglong uStack_18;
  
  uStack_18 = _DAT_181f8ca80 ^ (ulonglong)auStack_a8;
  *param_1 = 0;
  param_1[1] = 0;
  param_1[2] = 0;
  param_1[3] = 0;
  uVar3 = *(undefined4 *)((longlong)param_2 + 4);
  lVar1 = param_2[1];
  uVar4 = *(undefined4 *)((longlong)param_2 + 0xc);
  *(int *)param_1 = (int)*param_2;
  *(undefined4 *)((longlong)param_1 + 4) = uVar3;
  *(int *)(param_1 + 1) = (int)lVar1;
  *(undefined4 *)((longlong)param_1 + 0xc) = uVar4;
  uVar3 = *(undefined4 *)((longlong)param_2 + 0x14);
  lVar1 = param_2[3];
  uVar4 = *(undefined4 *)((longlong)param_2 + 0x1c);
  *(int *)(param_1 + 2) = (int)param_2[2];
  *(undefined4 *)((longlong)param_1 + 0x14) = uVar3;
  *(int *)(param_1 + 3) = (int)lVar1;
  *(undefined4 *)((longlong)param_1 + 0x1c) = uVar4;
  *(undefined2 *)param_2 = 0;
  param_2[2] = 0;
  param_2[3] = 7;
  param_1[4] = 0;
  *(undefined1 *)(param_1 + 9) = 0;
  *(undefined1 *)(param_1 + 10) = 0;
  param_1[0xb] = 0;
  param_1[0xc] = 0;
  param_1[0xd] = 0;
  puStack_68 = param_1;
  plStack_20 = param_2;
  func_0x000180fa0258(param_1 + 5,param_3,0x20);
  iStack_78 = 0;
  uStack_70 = 0x181f906d0;
  FUN_1805e1ed0(param_1,&iStack_78);
  if ((*(longlong *)(uStack_70 + 8) != _DAT_181f906d8) || (iStack_78 != 0)) {
LAB_1805e13ae:
    iStack_58 = iStack_78;
    uStack_54 = uStack_74;
    uStack_50 = (undefined4)uStack_70;
    uStack_4c = uStack_70._4_4_;
    FUN_18014a1c0(auStack_48,&iStack_58);
    func_0x000180fa0288(auStack_48,&UNK_181f7a360);
    pcVar2 = (code *)swi(3);
    (*pcVar2)();
    return;
  }
  if (7 < (ulonglong)param_2[3]) {
    lVar1 = *param_2;
    lVar5 = lVar1;
    if ((0xfff < param_2[3] * 2 + 2U) &&
       (lVar5 = *(longlong *)(lVar1 + -8), 0x1f < (lVar1 - lVar5) - 8U)) {
      uStack_88 = 0;
      _invoke_watson(0,0,0,0);
      goto LAB_1805e13ae;
    }
    _aligned_free(lVar5);
  }
  param_2[2] = 0;
  param_2[3] = 7;
  *(undefined2 *)param_2 = 0;
  FUN_180f9eb40(uStack_18 ^ (ulonglong)auStack_a8);
  return;
}


// FUNCTION 180c03b70

undefined8
thunk_FUN_180c03e30(undefined8 param_1,longlong param_2,ulonglong param_3,ulonglong param_4)

{
  undefined8 uVar1;
  
  if ((param_4 - 1 < 0x40) && (param_3 < 0x41)) {
    if ((param_2 == 0) || (param_3 == 0)) {
      uVar1 = FUN_180c07ca0(param_1,param_4 & 0xff);
    }
    else {
      uVar1 = FUN_180c07d40(param_1,param_4 & 0xff,param_2,param_3 & 0xff);
    }
    if ((int)uVar1 == 0) {
      return uVar1;
    }
  }
  return 0xffffffff;
}


// FUNCTION 180c03b60

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

undefined8 thunk_FUN_180c07b20(undefined8 *param_1,undefined8 param_2,char param_3)

{
  ulonglong uVar1;
  undefined8 uStack_48;
  undefined8 uStack_40;
  undefined8 uStack_38;
  undefined8 uStack_30;
  undefined8 uStack_28;
  undefined8 uStack_20;
  undefined8 uStack_18;
  undefined8 uStack_10;
  
  if (0x3f < (byte)(param_3 - 1U)) {
    FUN_180c03f90();
  }
  if (param_1[10] != 0) {
    return 0xffffffff;
  }
  if (0x80 < (ulonglong)param_1[0x2c]) {
    param_1[8] = param_1[8] + 0x80;
    param_1[9] = param_1[9] + (ulonglong)((ulonglong)param_1[8] < 0x80);
    (*_DAT_181f84080)(param_1,param_1 + 0xc);
    param_1[0x2c] = param_1[0x2c] + -0x80;
    func_0x000180fa025e(param_1 + 0xc,param_1 + 0x1c,param_1[0x2c]);
  }
  uVar1 = param_1[0x2c];
  param_1[8] = param_1[8] + uVar1;
  param_1[9] = param_1[9] + (ulonglong)((ulonglong)param_1[8] < uVar1);
  if (*(char *)(param_1 + 0x2d) != '\0') {
    param_1[0xb] = 0xffffffffffffffff;
  }
  param_1[10] = 0xffffffffffffffff;
  func_0x000180fa0252((longlong)param_1 + uVar1 + 0x60,0,0x100 - uVar1);
  (*_DAT_181f84080)(param_1,param_1 + 0xc);
  uStack_48 = *param_1;
  uStack_40 = param_1[1];
  uStack_38 = param_1[2];
  uStack_30 = param_1[3];
  uStack_28 = param_1[4];
  uStack_20 = param_1[5];
  uStack_18 = param_1[6];
  uStack_10 = param_1[7];
  func_0x000180fa025e(param_2,&uStack_48,param_3);
  FUN_180c08100(param_1,0x40);
  FUN_180c08100(param_1 + 0xc,0x100);
  return 0;
}


